import { createClient } from "@supabase/supabase-js";
const saved = JSON.parse(
  localStorage.getItem("football.cloud.config") || "null",
);
export const config = {
  url: import.meta.env.VITE_SUPABASE_URL || saved?.url || "",
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || saved?.key || "",
};
export const client =
  config.url && config.key ? createClient(config.url, config.key) : null;
export const tables = [
  "teams",
  "players",
  "competitions",
  "entries",
  "matches",
  "lineups",
  "events",
];
export function configure(url, key) {
  if (!/^https:\/\/[^/]+/.test(url))
    throw Error("กรุณาใส่ Supabase Project URL แบบ https://");
  if (key.startsWith("sb_secret_")) throw Error("ใช้ Publishable key เท่านั้น");
  if (key.startsWith("eyJ")) {
    try {
      const body = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (body.role === "service_role")
        throw Error("ห้ามใช้ service-role key ในเว็บ");
    } catch (e) {
      if (e.message.includes("service-role")) throw e;
    }
  }
  localStorage.setItem(
    "football.cloud.config",
    JSON.stringify({ url: url.replace(/\/$/, ""), key }),
  );
  location.reload();
}
export async function fetchAll() {
  const result = {};
  await Promise.all(
    tables.map(async (table) => {
      let rows = [],
        from = 0;
      while (true) {
        const { data, error } = await client
          .from("fm_" + table)
          .select("*")
          .order("id")
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      result[table] = rows;
    }),
  );
  return result;
}
export async function save(table, payload, old) {
  let request = old
    ? client
        .from("fm_" + table)
        .update(payload)
        .eq("id", old.id)
    : client.from("fm_" + table).insert(payload);
  if (old?.version) request = request.eq("version", old.version);
  const { data, error } = await request.select().single();
  if (error) {
    if (error.code === "PGRST116")
      throw Error("ข้อมูลถูกแก้จากอีกเครื่องแล้ว กรุณาโหลดใหม่ก่อนบันทึก");
    throw error;
  }
  return data;
}
export async function remove(table, row) {
  let request = client
    .from("fm_" + table)
    .delete()
    .eq("id", row.id);
  if (row.version) request = request.eq("version", row.version);
  const { data, error } = await request.select();
  if (error) throw error;
  if (!data.length) throw Error("ข้อมูลถูกเปลี่ยนแล้ว กรุณาโหลดใหม่");
}
const logoCache = new Map();
export async function logoURL(path) {
  if (!path) return "";
  const cached = logoCache.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await client.storage
    .from("fm-logos")
    .createSignedUrl(path, 3600);
  if (error) return "";
  logoCache.set(path, { url: data.signedUrl, until: Date.now() + 3000000 });
  return data.signedUrl;
}
export async function uploadLogo(file, userId) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5242880
  )
    throw Error("โลโก้ต้องเป็น PNG/JPG/WebP ไม่เกิน 5 MB");
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[
    file.type
  ];
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage.from("fm-logos").upload(path, file);
  if (error) throw error;
  return path;
}
