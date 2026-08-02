/* ============================================================
   SUPABASE CONFIG — ĐIỀN THÔNG TIN PROJECT CỦA BẠN TẠI ĐÂY
   ============================================================
   1. Tạo project miễn phí tại https://supabase.com
   2. Vào Project Settings → API → copy "Project URL" và "anon public" key
   3. Dán vào 2 ô bên dưới (giữ nguyên dấu nháy '...')
   4. Chạy file supabase/schema.sql trong SQL Editor của project
   ============================================================ */
const SUPABASE_CONFIG = {
  url: '',           // ví dụ: 'https://abcdefghij.supabase.co'
  anonKey: '',       // ví dụ: 'eyJhbGciOiJIUzI1NiIs...'
  autoAnonymous: true // tự đăng nhập ẩn danh khi mở app (cần bật
                      // Authentication → Sign In / Up → Anonymous
                      // trong dashboard; tắt nếu bạn dùng email/password)
};
