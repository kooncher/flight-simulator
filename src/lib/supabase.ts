const getSupabase = () => (window as any).supabase;

const supabaseUrl = 'https://lrxllwqwtkamrkmvvtnu.supabase.co'
const supabaseAnonKey = 'sb_publishable_s7tQgKkrrqnnvXTe03SdyQ_j3wPf5Sv'

export const supabase = getSupabase().createClient(supabaseUrl, supabaseAnonKey)
