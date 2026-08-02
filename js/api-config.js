/* ============================================================
   TaskFlow-Todoist — API CONFIG (backend Render)
   ============================================================
   1. Deploy backend: render.com → New → Blueprint → chọn repo này
      (tạo Postgres + Web Service tự động, xem server/render.yaml)
   2. Dán URL backend vào ô url bên dưới, vd:
      url: 'https://taskflow-backend.onrender.com'
   3. Chạy local: giữ url: '' và chạy `node server/index.js`
      (backend tự dùng Postgres ảo trong bộ nhớ, không cần cài DB)
   ============================================================ */
const API_CONFIG = {
  url: 'http://localhost:4000', // URL backend — đổi sang URL Render khi deploy
  google: true, // hiện nút "Tiếp tục với Google" (cần GOOGLE_CLIENT_ID trên server)
};
