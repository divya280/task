CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS doctors (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  email     TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'General'
);

CREATE TABLE IF NOT EXISTS patients (
  id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name  TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID        NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  is_booked  BOOLEAN     NOT NULL DEFAULT FALSE,
  CONSTRAINT slots_time_window CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id  UUID        NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  slot_id    UUID        NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

-- Migration: Remove plaintext password column and fix seed_system_admin function
DROP FUNCTION IF EXISTS seed_system_admin(TEXT, TEXT) CASCADE;
ALTER TABLE IF EXISTS system_admins DROP COLUMN IF EXISTS password CASCADE;
ALTER TABLE IF EXISTS system_admins ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Update any NULL password_hash values before setting NOT NULL constraint
UPDATE system_admins 
SET password_hash = crypt('admin123', gen_salt('bf'))
WHERE password_hash IS NULL;

-- Now set the NOT NULL constraint
ALTER TABLE IF EXISTS system_admins ALTER COLUMN password_hash SET NOT NULL;

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_admins ENABLE ROW LEVEL SECURITY;

WITH ranked_slot_appointments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY slot_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM appointments
  WHERE status = 'active'
),
ranked_patient_doctor_appointments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY patient_id, doctor_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM appointments
  WHERE status = 'active'
),
duplicate_appointments AS (
  SELECT id
  FROM ranked_slot_appointments
  WHERE rn > 1
  UNION
  SELECT id
  FROM ranked_patient_doctor_appointments
  WHERE rn > 1
)
UPDATE appointments
SET status = 'cancelled'
WHERE id IN (SELECT id FROM duplicate_appointments);

CREATE INDEX IF NOT EXISTS slots_doctor_start_time_idx
  ON slots (doctor_id, start_time);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_idx
  ON appointments (slot_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_patient_doctor_idx
  ON appointments (patient_id, doctor_id)
  WHERE status = 'active';

DROP POLICY IF EXISTS "authenticated_read_doctors" ON doctors;
DROP POLICY IF EXISTS "patients_read_own" ON patients;
DROP POLICY IF EXISTS "doctors_read_assigned_patients" ON patients;
DROP POLICY IF EXISTS "authenticated_read_slots" ON slots;
DROP POLICY IF EXISTS "patient_read_own_appointments" ON appointments;
DROP POLICY IF EXISTS "doctor_read_own_appointments" ON appointments;

CREATE POLICY "authenticated_read_doctors" ON doctors
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "patients_read_own" ON patients
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "doctors_read_assigned_patients" ON patients
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM appointments
      WHERE appointments.patient_id = patients.id
        AND appointments.doctor_id = auth.uid()
    )
  );

CREATE POLICY "authenticated_read_slots" ON slots
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "patient_read_own_appointments" ON appointments
  FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "doctor_read_own_appointments" ON appointments
  FOR SELECT USING (auth.uid() = doctor_id);

INSERT INTO system_admins (email, password_hash)
VALUES ('admin@test.com', crypt('admin123', gen_salt('bf')))
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

CREATE OR REPLACE FUNCTION authenticate_system_admin(
  p_email TEXT,
  p_password TEXT
)
RETURNS UUID AS $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id
  INTO admin_id
  FROM system_admins
  WHERE email = p_email
    AND password_hash = crypt(p_password, password_hash);

  RETURN admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION seed_system_admin(
  p_email TEXT,
  p_password TEXT
)
RETURNS UUID AS $$
DECLARE
  admin_id UUID;
BEGIN
  INSERT INTO system_admins (email, password_hash)
  VALUES (p_email, crypt(p_password, gen_salt('bf')))
  ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash
  RETURNING id INTO admin_id;

  RETURN admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION book_appointment(
  p_patient_id UUID,
  p_doctor_id UUID,
  p_slot_id UUID
)
RETURNS appointments AS $$
DECLARE
  result appointments;
  slot_record slots;
BEGIN
  SELECT *
  INTO slot_record
  FROM slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;

  IF slot_record.doctor_id <> p_doctor_id THEN
    RAISE EXCEPTION 'slot_doctor_mismatch';
  END IF;

  IF slot_record.start_time <= NOW() THEN
    RAISE EXCEPTION 'slot_in_past';
  END IF;

  IF slot_record.is_booked THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  UPDATE slots
  SET is_booked = true
  WHERE id = p_slot_id;

  INSERT INTO appointments (patient_id, doctor_id, slot_id, status)
  VALUES (p_patient_id, p_doctor_id, p_slot_id, 'active')
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
