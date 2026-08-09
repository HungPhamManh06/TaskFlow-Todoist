// TaskFlow — Chatbot trợ lý học tập (tách từ app.js trong P11 refactor, extraction 21).
// Gồm: CHAT_RESPONSES (dictionary trả lời theo chủ đề), doChatSend (gửi tin nhắn +
// tự động trả lời), doChatSuggest (chip gợi ý chủ đề), chatBotReply (khớp từ khóa).
// Module này KHÔNG phụ thuộc state/global khác ngoài `esc()` (chỉ gọi lúc runtime);
// helper app-level resolve qua global scope tại thời điểm GỌI — browser: app.js load
// sau chat.js nhưng mọi hàm chỉ chạy sau boot (pattern syncui/clock); Node: textual
// test only (không execute, không cần mock).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowChat = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CHAT_RESPONSES = {
    'study-plan': '📚 <b>Kế hoạch học tập hiệu quả:</b><br><br>1. <b>Xác định mục tiêu:</b> Bạn muốn đạt được gì? (VD: thi đỗ, học ngoại ngữ, kỹ năng mới)<br><br>2. <b>Chia nhỏ mục tiêu:</b> Chia thành các mục tiêu theo tháng/tuần trong app.<br><br>3. <b>Phân bổ thời gian:</b> Dùng Pomodoro 25 phút tập trung, 5 phút nghỉ — sau 4 lần nghỉ dài 25 phút.<br><br>4. <b>Theo dõi thói quen:</b> Tạo habit học tập trong app để theo dõi % hoàn thành và streak 🔥<br><br>5. <b>Phản ánh:</b> Cuối tuần viết reflection để xem lại tiến độ.<br><br>💡 Gợi ý: Dùng tính năng Mục tiêu năm để đặt mục tiêu lớn, Mục tiêu tháng để chia nhỏ, và Task tuần để hành động cụ thể!',
    'goal-tips': '🎯 <b>Mẹo đạt mục tiêu:</b><br><br>1. <b>SMART goals:</b> Cụ thể, đo lường được, khả thi, liên quan, có thời hạn.<br><br>2. <b>Chia nhỏ:</b> Mục tiêu năm → tháng → tuần. App có sẵn cấu trúc này!<br><br>3. <b>Theo dõi:</b> Tick ✓ mỗi mục tiêu khi hoàn thành. App tự tính % tiến độ.<br><br>4. <b>Streak 🔥:</b> Duy trì mỗi ngày — streak càng dài càng có động lực!<br><br>5. <b>Phản ánh:</b> Viết reflection mỗi tuần/tháng để rút kinh nghiệm.<br><br>💡 Bạn có thể dùng Pull Goals từ Dashboard để tổng hợp mục tiêu từ 12 tháng!',
    'habit-tips': '🔥 <b>Mẹo xây thói quen mới:</b><br><br>1. <b>Bắt đầu nhỏ:</b> Chỉ 1 thói quen, cực kỳ dễ (VD: đọc 1 trang sách).<br><br>2. <b>Gắn với thói quen cũ:</b> "Sau khi uống cà phê sáng, tôi sẽ đọc 1 trang sách."<br><br>3. <b>Theo dõi liên tục:</b> Tick ✓ mỗi ngày trong app, duy trì streak 🔥<br><br>4. <b>Đặt mục tiêu %:</b> Mỗi habit có target %, app tự tính. Đạt 100% là cíuu!<br><br>5. <b>Heatmap:</b> Xem heatmap tháng và năm để thấy sự tiến bộ.<br><br>💡 App có sẵn 10 thói quen mẫu — bạn có thể xoá/sửa và thêm thói quen của riêng mình!',
    'pomodoro-tips': '🍅 <b>Cách dùng Pomodoro hiệu quả:</b><br><br>1. <b>Chọn task:</b> Chọn 1 task cụ thể để tập trung.<br><br>2. <b>Bắt đầu timer:</b> Ấn nút 🍅, tập trung 25 phút.<br><br>3. <b>Nghỉ ngắn:</b> Hết 25 phút → nghỉ 5 phút. Đứng dậy, vươn vai.<br><br>4. <b>Lặp lại:</b> Sau 4 lần tập trung → nghỉ dài 25 phút 🧘<br><br>5. <b>Theo dõi:</b> App ghi lại số lần tập trung hôm nay và tuần này.<br><br>💡 Mẹo: Dùng Pomodoro widget ngay trong view tuần để tiện theo dõi!',
  };

  function doChatSend() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    // Thêm tin nhắn user
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.innerHTML = esc(text);
    msgs.appendChild(userDiv);
    // Tự động trả lời
    setTimeout(() => {
      const botDiv = document.createElement('div');
      botDiv.className = 'chat-msg bot';
      botDiv.innerHTML = chatBotReply(text);
      msgs.appendChild(botDiv);
      msgs.scrollTop = msgs.scrollHeight;
    }, 500);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function doChatSuggest(topic) {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    const botDiv = document.createElement('div');
    botDiv.className = 'chat-msg bot';
    botDiv.innerHTML = CHAT_RESPONSES[topic] || 'Cảm ơn bạn! Tôi sẽ giúp bạn học tập tốt hơn.';
    msgs.appendChild(botDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function chatBotReply(text) {
    const lower = text.toLowerCase();
    // Kiểm tra từ khóa
    if (lower.includes('kế hoạch') || lower.includes('học tập') || lower.includes('study') || lower.includes('plan'))
      return CHAT_RESPONSES['study-plan'];
    if (lower.includes('mục tiêu') || lower.includes('goal') || lower.includes('target'))
      return CHAT_RESPONSES['goal-tips'];
    if (lower.includes('thói quen') || lower.includes('habit') || lower.includes('streak') || lower.includes('xây'))
      return CHAT_RESPONSES['habit-tips'];
    if (lower.includes('pomodoro') || lower.includes('tập trung') || lower.includes('focus') || lower.includes('timer') || lower.includes('cà chua'))
      return CHAT_RESPONSES['pomodoro-tips'];
    // Trả lời mặc định
    return 'Cảm ơn câu hỏi của bạn! 🐥<br><br>Bạn có thể tham khảo các chủ đề:<br>• 📚 <b>Lên kế hoạch học tập</b> — bấm nút gợi ý bên trên<br>• 🎯 <b>Mẹo đạt mục tiêu</b><br>• 🔥 <b>Xây thói quen mới</b><br>• 🍅 <b>Cách dùng Pomodoro</b><br><br>Hoặc gõ trực tiếp câu hỏi của bạn!';
  }

  return { CHAT_RESPONSES, doChatSend, doChatSuggest, chatBotReply };
});
