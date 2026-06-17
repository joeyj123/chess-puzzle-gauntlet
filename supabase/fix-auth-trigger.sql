-- Run this in Supabase SQL Editor if anonymous sign-in returns 500.
-- The trigger on auth.users must be allowed to insert into public.profiles.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Let Supabase Auth run the trigger when creating users
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT INSERT ON TABLE public.profiles TO supabase_auth_admin;

DROP POLICY IF EXISTS "profiles: own row insert" ON public.profiles;
CREATE POLICY "profiles: own row insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
