/* ============================================================
   TaskFlow-Todoist — API CONFIG (backend Render)
   ============================================================
   1. Deploy backend: render.com → New → Blueprint → chọn repo này
      (tạo Postgres + Web Service tự động, xem render.yaml)
   2. Dán URL backend vào ô url bên dưới, vd:
      url: 'https://taskflow-backend.onrender.com'
   3. Chạy local: đổi url: '' và chạy `node server/index.js`
      (backend tự dùng Postgres ảo trong bộ nhớ, không cần cài DB)
   ============================================================ */
const API_CONFIG = {
  url: 'https://todoist-m3c7.onrender.com', // URL backend Render
  google: true, // hiện nút "Tiếp tục với Google" (cần GOOGLE_CLIENT_ID trên server)
};
