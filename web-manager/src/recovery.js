// Capture the recovery fragment before the Auth client consumes it.
const fromRecovery = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
export const recoveryRequested = () => fromRecovery || new URLSearchParams(location.search).get("reset") === "1";
const root = () => document.querySelector("#app");
function authError(error) {
  if (error.status === 429) return "ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
  return "ดำเนินการไม่สำเร็จ: " + (error.message || error.code || "กรุณาลองใหม่");
}
export function requestRecovery(client, back) {
  root().innerHTML = `<div class="auth panel"><h2>ตั้งรหัสผ่านใหม่</h2><p>กรอกอีเมลที่ลงทะเบียน แล้วเปิดลิงก์จากอีเมลเพื่อตั้งรหัสผ่านใหม่</p><form id="recover-form"><label>อีเมล<input name="email" type="email" required autocomplete="email"></label><button class="primary" type="submit">ส่งลิงก์ตั้งรหัสผ่าน</button></form><p id="recover-status" role="status"></p><button type="button" id="recover-back">กลับเข้าสู่ระบบ</button></div>`;
  document.querySelector("#recover-back").onclick = back;
  document.querySelector("#recover-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target, submit = form.querySelector("button"), status = document.querySelector("#recover-status");
    submit.disabled = true;
    try {
      const redirect = new URL(location.pathname, location.origin);
      redirect.searchParams.set("reset", "1");
      const { error } = await client.auth.resetPasswordForEmail(new FormData(form).get("email").trim(), { redirectTo: redirect.href });
      if (error) throw error;
      status.textContent = "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่าน กรุณาตรวจกล่องจดหมายและจดหมายขยะ";
    } catch (error) { status.textContent = authError(error); }
    finally { submit.disabled = false; }
  };
}
export function recoveryForm(client, back, hasSession) {
  root().innerHTML = `<div class="auth panel"><h2>ตั้งรหัสผ่านใหม่</h2>${hasSession ? `<form id="new-password-form"><label>รหัสผ่านใหม่<input name="password" type="password" required minlength="8" autocomplete="new-password"></label><label>ยืนยันรหัสผ่านใหม่<input name="confirm" type="password" required minlength="8" autocomplete="new-password"></label><button class="primary" type="submit">บันทึกรหัสผ่านใหม่</button></form>` : `<p>ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ตั้งรหัสผ่านใหม่</p><button type="button" id="retry-recovery">ขอลิงก์ใหม่</button>`}<p id="recover-status" role="status"></p>`;
  if (!hasSession) {
    document.querySelector("#retry-recovery").onclick = () => requestRecovery(client, back);
    return;
  }
  document.querySelector("#new-password-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form), status = document.querySelector("#recover-status"), submit = form.querySelector("button");
    if (f.get("password") !== f.get("confirm")) { status.textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน"; return; }
    submit.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: f.get("password") });
      if (error) throw error;
      form.remove();
      history.replaceState(null, "", location.pathname);
      status.textContent = "ตั้งรหัสผ่านใหม่แล้ว กำลังกลับหน้าเข้าสู่ระบบ";
      await client.auth.signOut({ scope: "local" });
      back();
    } catch (error) { status.textContent = authError(error); submit.disabled = false; }
  };
}
