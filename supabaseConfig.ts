import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qpwjzziirpcmsxaodeft.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwd2p6emlpcnBjbXN4YW9kZWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTEwNjUsImV4cCI6MjA4MzM2NzA2NX0.d2ydi4n0cyQXCUcWy9LlBNwve06FzfABjLy4xa8Dwi8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Storage bucket name for media files
export const MEDIA_BUCKET = 'media';
