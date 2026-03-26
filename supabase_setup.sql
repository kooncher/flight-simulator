-- 1. Courses Table
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  hours INTEGER DEFAULT 0,
  price DECIMAL NOT NULL,
  image TEXT,
  badge TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bookings Table
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  date DATE NOT NULL,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
  note TEXT, -- สำหรับหมายเหตุการจองหรือเลื่อนวัน
  instructor_id UUID REFERENCES auth.users(id), -- เก็บว่านักบินคนไหนเป็นคนรับสอน
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, slot) -- Prevent double booking
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES auth.users(id);

-- 3. Announcements Table
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- 'info', 'warning', 'danger'
  date TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Blocked Slots Table
CREATE TABLE blocked_slots (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  slot INTEGER NOT NULL,
  UNIQUE(date, slot)
);

-- 5. Saved Students Table
CREATE TABLE saved_students (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  UNIQUE(user_id, email)
);

-- RLS (Row Level Security) - Simplified for development
-- Enable RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_students ENABLE ROW LEVEL SECURITY;

-- Policies for Courses (Public read, Admin write)
CREATE POLICY "Allow public read courses" ON courses FOR SELECT USING (true);
CREATE POLICY "Allow admin all courses" ON courses FOR ALL USING (auth.jwt() ->> 'email' = 'admin@flight.com');

-- Policies for Announcements (Public read, Admin write)
CREATE POLICY "Allow public read announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "Allow admin all announcements" ON announcements FOR ALL USING (auth.jwt() ->> 'email' = 'admin@flight.com');

-- Policies for Bookings
CREATE POLICY "Allow users to read own bookings" ON bookings FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@flight.com');
CREATE POLICY "Allow users to insert own bookings" ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to update own bookings" ON bookings FOR UPDATE USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@flight.com');
CREATE POLICY "Allow staff update bookings" ON bookings FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')));

-- Policies for Blocked Slots (Public read, Admin write)
CREATE POLICY "Allow public read blocked_slots" ON blocked_slots FOR SELECT USING (true);
CREATE POLICY "Allow admin all blocked_slots" ON blocked_slots FOR ALL USING (auth.jwt() ->> 'email' = 'admin@flight.com');

-- 6. Profiles Table (Extended User Data)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  address TEXT,
  role TEXT DEFAULT 'User', -- 'Admin', 'Technician', 'Pilot', 'User'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- RLS for Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users to read all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow users to update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow admin to update any profile" ON profiles FOR UPDATE USING (auth.jwt() ->> 'email' = 'admin@flight.com');
CREATE POLICY "Allow users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, name, phone, address)
  VALUES (new.id, new.email, 'User', NULL, NULL, NULL);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Default Data for Courses
INSERT INTO courses (id, name, description, hours, price, image, badge, tags) VALUES
('intro', 'Intro Flight', 'บินทดลองพื้นฐาน 1 ชม.', 1, 3500, 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?auto=format&fit=crop&w=1200&q=60', 'RECOMMENDED', '{Beginner, Experience}'),
('ppl', 'Private Pilot', 'หลักสูตรนักบินส่วนบุคคล', 40, 120000, 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=60', 'POPULAR', '{License, VFR}'),
('ifr', 'IFR Rating', 'การบินด้วยเครื่องมือ', 20, 80000, 'https://images.unsplash.com/photo-1531266752426-6bd4f7d2a0d9?auto=format&fit=crop&w=1200&q=60', 'NEW', '{Instruments, Advanced}'),
('xc', 'Cross Country', 'บินทางไกล วางแผนการเดินทางและเชื้อเพลิง', 10, 45000, 'https://images.unsplash.com/photo-1516239321564-06b08170ed3a?auto=format&fit=crop&w=1200&q=60', NULL, '{Planning, Fuel}'),
('nav', 'Navigation Basics', 'พื้นฐานการนำร่อง แผนที่และเครื่องมือ', 8, 30000, 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1200&q=60', NULL, '{Map, VOR, Compass}'),
('aero', 'Basic Aerobatics', 'พื้นฐานแอโรแบติก ปลอดภัยและควบคุมอากาศยาน', 6, 38000, 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?auto=format&fit=crop&w=1200&q=60', NULL, '{Maneuvers, Safety}'),
('multi', 'Multi-Engine Intro', 'ทำความรู้จักเครื่องยนต์คู่ การควบคุมและความปลอดภัย', 5, 42000, 'https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?auto=format&fit=crop&w=1200&q=60', NULL, '{Twin, MEP}'),
('night', 'Night Rating Prep', 'เตรียมความพร้อมการบินกลางคืน ขั้นตอนและข้อควรระวัง', 7, 36000, 'https://images.unsplash.com/photo-1498861954500-5fca8909b4d9?auto=format&fit=crop&w=1200&q=60', NULL, '{Night, Procedures}'),
('ul', 'Ultralight Experience', 'สัมผัสการบินเครื่องบินเบา สนุกและปลอดภัย', 2, 6000, 'https://images.unsplash.com/photo-1547076529-95b43a6d1f50?auto=format&fit=crop&w=1200&q=60', NULL, '{Fun, Short}');

-- 7. Flight Simulator Ops
CREATE TABLE IF NOT EXISTS simulator_status (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  ready BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE simulator_status ADD COLUMN IF NOT EXISTS booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE;

-- Insert default row only if not exists
INSERT INTO simulator_status (id, ready, note)
VALUES ('main', true, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS replacement_requests (
  id TEXT PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id),
  date DATE NOT NULL,
  slot INTEGER NOT NULL,
  replacement_name TEXT,
  replacement_phone TEXT,
  note TEXT NOT NULL,
  status TEXT DEFAULT 'pending_admin', -- pending_admin, acknowledged, approved, rejected, cancelled
  admin_note TEXT,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE replacement_requests ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES auth.users(id);
ALTER TABLE replacement_requests ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

ALTER TABLE simulator_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE replacement_requests ENABLE ROW LEVEL SECURITY;

-- Staff helper checks via profiles.role
CREATE POLICY "Allow staff read simulator_status" ON simulator_status
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')));

CREATE POLICY "Allow staff update simulator_status" ON simulator_status
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')));

CREATE POLICY "Allow staff insert simulator_status" ON simulator_status
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')));

CREATE POLICY "Allow staff read all bookings" ON bookings
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')));

CREATE POLICY "Allow staff manage blocked_slots" ON blocked_slots
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Technician', 'Pilot')));

CREATE POLICY "Allow admin read all replacement_requests" ON replacement_requests
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Admin'));

CREATE POLICY "Allow staff read own replacement_requests" ON replacement_requests
  FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Allow staff insert replacement_requests" ON replacement_requests
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Allow admin update any replacement_requests" ON replacement_requests
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Admin'));

CREATE POLICY "Allow staff update own replacement_requests" ON replacement_requests
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
