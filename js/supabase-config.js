/* ============================================================
   SUPABASE CONFIG — ĐIỀN THÔNG TIN PROJECT CỦA BẠN TẠI ĐÂY
   ============================================================
   1. Tạo project miễn phí tại https://supabase.com
   2. Lấy key (giao diện mới):
      • Cách nhanh: bấm nút "Connect" ở góc trên cùng → kéo tới mục
        "Use the Supabase client library" → copy Project URL + anon key
      • Hoặc: Settings (⚙️) → API Keys → tab "Legacy API Keys" →
        copy "Project URL" và "anon public" key (dạng eyJhbGciOiJIUzI1NiIs...)
   3. Dán vào 2 ô bên dưới (giữ nguyên dấu nháy '...')
   4. Chạy file supabase/schema.sql trong SQL Editor của project
   ============================================================ */
const SUPABASE_CONFIG = {
  url: 'https://agjbeejaaocwudkyoeiu.supabase.co', // Project URL
  // ⚠️ Dùng PUBLISHABLE key (an toàn public) — KHÔNG BAO GIỜ dùng SECRET key ở frontend
  anonKey: 'sb_publishable_sFLRWz4F8N3zXBGw7l8UYg_Y6H-WBu2',
  autoAnonymous: true // tự đăng nhập ẩn danh khi mở app (cần bật
                      // Authentication → Sign In / Up → Providers →
                      // Anonymous sign-ins → Enable; tắt nếu dùng email/password)
};
