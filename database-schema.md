# Database Schema Design for Flight Reservation System

## 1. Users Table (users)
Extends Supabase Auth users with profile data.
- `id` (UUID, PK): References auth.users.id
- `email` (Text, Unique): User's email
- `full_name` (Text): Display name
- `phone` (Text): Contact number (10 digits)
- `role` (Text): 'student' | 'admin' | 'instructor'
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## 2. Courses Table (courses)
Master data for available courses.
- `id` (Text/UUID, PK): e.g., 'intro', 'ppl'
- `title` (Text): Course name
- `description` (Text): Detail info
- `total_hours` (Integer): Total course duration (e.g., 40)
- `price` (Decimal): Cost per course
- `image_url` (Text): Cover image
- `badge` (Text): 'NEW', 'POPULAR', etc.
- `tags` (Text[]): Array of tags
- `is_active` (Boolean): For soft delete/hiding

## 3. Bookings Table (bookings)
Core transaction table.
- `id` (UUID, PK)
- `user_id` (UUID, FK): References users.id
- `course_id` (Text/UUID, FK): References courses.id
- `booking_date` (Date): YYYY-MM-DD
- `slot_index` (Integer): 0-3 (representing 08:00, 10:00, etc.)
- `status` (Text): 'confirmed' | 'cancelled' | 'completed'
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Constraints & Indexes:**
- Unique Constraint: `(booking_date, slot_index)` -> Prevents double booking for the same slot globally.
- Index: `user_id` -> For fast lookup of "My Bookings".
- Index: `booking_date` -> For fast calendar availability check.

## 4. Availability/Block Table (availability_overrides) - Optional but Recommended
For handling holidays, maintenance, or instructor unavailability.
- `id` (UUID, PK)
- `date` (Date): The specific date blocked
- `slot_index` (Integer, Nullable): If null, blocks entire day. If set, blocks specific slot.
- `reason` (Text): e.g., "Maintenance", "Holiday"
- `created_by` (UUID, FK): Admin ID

## Relationships
- User 1 : N Bookings
- Course 1 : N Bookings

## Security (RLS Policies)
- **Users**: Users can read/update their own profile. Admins can read all.
- **Courses**: Public read-only. Admins can write.
- **Bookings**:
  - Users can create their own booking.
  - Users can read their own bookings.
  - Users can update (cancel/reschedule) their own booking (with logic checks).
  - Admins can read/write all.
