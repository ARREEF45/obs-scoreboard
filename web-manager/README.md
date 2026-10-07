# สนาม · Football Manager

เว็บภาษาไทยสำหรับคอมและมือถือ ใช้ Supabase เก็บข้อมูลและเข้าสู่ระบบ แยกจากไฟล์ OBS Portable เดิม ไม่อัปโหลดข้อมูลทีมจริงหรือไฟล์สำรองขึ้น GitHub

## ฟีเจอร์

- ทีม: ชื่อ โลโก้ สีชุดเหย้า–เยือน ผู้คุมทีม และเก็บทีมถาวร
- นักเตะ: ทีม เบอร์ ตำแหน่ง และพักใช้งานโดยเก็บประวัติ
- รายการแข่งขัน/ฤดูกาล พร้อมลงทะเบียนทีมและกำหนดคะแนนชนะ–เสมอ–แพ้
- โปรแกรมแข่ง: สร้างรายคู่หรือพบกันหมด 1/2 เลก วันเวลาไทย สนาม รอบ และสถานะ
- รายชื่อนัดแข่งขัน: ตัวจริงไม่เกิน 11 คน ตัวสำรอง คนที่ไม่เลือกจะไม่อยู่ในกราฟิก
- ประตู ผู้จ่ายแอสซิสต์ ประตูตัวเอง ใบเหลือง เหลืองที่สอง และใบแดง พร้อมแก้ไข/ลบ
- สกอร์และสถิติคำนวณจากเหตุการณ์เดียวกัน ไม่ต้องกรอกสกอร์ซ้ำ
- ตารางคะแนนเฉพาะนัดจบแล้ว; สถิตินักเตะรวมเฉพาะนัดกำลังแข่ง/จบแล้ว
- นำเข้าคลังทีม Portable รุ่น 1/2; ทีมและนักเตะนำเข้าในธุรกรรมเดียวต่อทีม
- ดาวน์โหลดข้อมูลสำรอง และส่งไฟล์แมตช์ไป Import ใน OBS Portable

## ติดตั้ง Supabase

1. เลือกโปรเจกต์ Supabase ที่ต้องการใช้
2. ใน SQL Editor รันไฟล์ตามลำดับ **ครั้งเดียว**:
   - `supabase/migrations/001_football_manager.sql`
   - `supabase/migrations/002_logo_storage.sql`
3. ตารางขึ้นต้น `fm_` เพื่อแยกจากระบบอื่น เปิด RLS แล้วทุกตาราง จำกัดข้อมูลตาม `auth.uid()`
4. สร้างผู้ใช้ผู้ดูแลใน Authentication → Users โดยยืนยันอีเมลให้บัญชีพร้อมใช้งาน หน้านี้ไม่มีการสมัครสมาชิกสาธารณะ
5. ใช้บัญชีเดียวกันบนคอมและมือถือเพื่อเข้าถึงการแข่งขันชุดเดียวกัน คนละบัญชีมีข้อมูลแยกกัน รุ่นนี้ยังไม่มีการเชิญสมาชิกหรือกำหนดหลายบทบาท
6. คัดลอก Project URL และ **Publishable key** เท่านั้น ห้ามนำ `service_role` หรือ `sb_secret_` ใส่เว็บ/commit
7. โลโก้อยู่ใน Storage bucket `fm-logos` แบบ private โดยใช้ signed URL ชั่วคราวในการแสดงผล

อ้างอิง: [Supabase JavaScript](https://supabase.com/docs/reference/javascript/initializing), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

## เปิดเว็บในเครื่อง

ต้องใช้ Node.js 22.12+ หรือ 24 และ npm

```sh
npm ci
cp .env.example .env
# ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY ใน .env
npm run dev
```

PowerShell ใช้ `Copy-Item .env.example .env` แทน `cp` ได้ เปิด URL ที่ Vite แสดง บนมือถือใช้ IP ของคอมและพอร์ตเดียวกันในเครือข่ายเดียวกัน

หากไม่มี `.env` หน้าแรกให้กรอก URL/Publishable key ได้ ซึ่งจะจำเฉพาะเบราว์เซอร์นั้น สำหรับเว็บใช้งานจริงควรตั้งค่าตอน build เพื่อให้ทุกเครื่องใช้โปรเจกต์เดียวกัน

## Build และ GitHub

```sh
npm run build
npm run preview
```

ไฟล์พร้อมโฮสต์อยู่ใน `dist/` ใช้ static hosting ได้ เช่น GitHub Pages โดย `base: './'` รองรับ subdirectory ของ repository ส่วนรหัสผ่าน/ข้อมูลทีมอยู่ใน Supabase ไม่อยู่ในไฟล์เว็บ


## ขั้นตอนใช้งาน

1. เพิ่มทีมและนักเตะ หรือ Settings → นำเข้าคลังทีมจาก Portable
2. สร้างรายการแข่งขัน → ทีมที่เข้าร่วม
3. โปรแกรมการแข่งขัน → เลือกรายการ → สร้างพบกันหมด หรือเพิ่มรายคู่
4. เปิดแมตช์ → ตัวจริง/ตัวสำรอง → เลือกนักเตะ
5. ตั้งสถานะแมตช์เป็นกำลังแข่ง บันทึกประตูพร้อมผู้จ่าย และใบต่าง ๆ
6. จบการแข่งขัน → ตั้งสถานะจบแล้ว ตารางคะแนนคำนวณใหม่

โปรแกรมรอบเดียวกันที่สร้างอัตโนมัติใช้เวลาเริ่มเดียวกัน แก้วันเวลาแต่ละคู่ภายหลังได้ เวลาในฟอร์มและหน้าจอใช้ Asia/Bangkok ส่วนฐานข้อมูลเก็บ `timestamptz`

การลบประตูจะลบแอสซิสต์นั้นจากสถิติด้วย ประตูตัวเองเพิ่มสกอร์ให้ฝั่งตรงข้าม ไม่นับเป็นดาวซัลโว การบันทึกเหลืองที่สองนับเหลืองเพิ่มหนึ่งและแดงหนึ่ง (ควรมีเหตุการณ์เหลืองแรกอยู่ก่อน)

## การซิงค์และความถูกต้อง

เว็บโหลดข้อมูลล่าสุดทุก 8 วินาทีเมื่อไม่ได้เปิดฟอร์มแก้ไข การแก้ไขข้อมูลหลักใช้ version ป้องกันข้อมูลเก่าทับใหม่ การบันทึกรายชื่อเช็ก snapshot และทำใน transaction ถ้าข้อมูลจากอีกเครื่องเปลี่ยนให้ปิดฟอร์ม รีเฟรช แล้วเปิดแก้ใหม่

ชื่อทีมและโลโก้อ้างอิง team ID เดียวกันทุกหน้า ฐานข้อมูลบังคับผู้ยิง/ผู้จ่ายเป็นผู้เล่นที่ลงทะเบียนในรายชื่อนัดนั้น และห้ามแอสซิสต์ตัวเองหรือข้ามทีม รายชื่อที่มีเหตุการณ์อยู่แล้วนำออกไม่ได้จนกว่าแก้เหตุการณ์ที่เกี่ยวข้อง

## ใช้ร่วมกับ OBS Portable

ในหน้าแมตช์ กด **ดาวน์โหลดแมตช์ OBS** แล้ว Import แมตช์ใน Control ของ Portable การส่งนี้เป็น snapshot ของชื่อ โลโก้ สีชุด สกอร์ และรายชื่อที่เลือก ไม่ใช่ live cloud bridge และไม่ส่งประวัติ replay/ตัวจับเวลาเดิม ไฟล์ส่งออกตั้งเวลาหยุดที่ 00:00 เพื่อให้ผู้ควบคุมตั้งเวลาเอง

ระบบ Portable V6 เดิมยังอยู่แยกต่างหาก ไม่มีการย้ายข้อมูลจริงอัตโนมัติ

## ทดสอบ

```sh
npm test
npm run test:e2e
```

- Unit: ประตู/แอสซิสต์ ใบ ตารางคะแนน และ round robin 2–10 ทีม
- Database: PostgreSQL ผ่าน PGlite รัน migration จริง ทดสอบ RLS ข้ามบัญชี foreign keys ธุรกรรม rollback ข้อจำกัดผู้เล่น และ stale writes
- Browser: mock HTTP transport ไป PostgreSQL ทดสอบ login → รายชื่อ → ประตู+แอสซิสต์ → สถิติ → จบแมตช์ → ตารางคะแนน และมือถือ

Browser test ใช้ Chrome/Edge ที่ติดตั้งไว้บน Windows หรือกำหนด `BROWSER_PATH` บน OS อื่น; หากไม่มี browser ในเครื่องใช้ `npx playwright-core install chromium` ก่อน

การทดสอบในเครื่องไม่แทนการทดสอบ Supabase Cloud จริง ต้องตรวจ Authentication, Storage และเปิดใช้งาน migration บนโปรเจกต์ปลายทางก่อนใช้งานจริง

## Published manager

The production app is served at https://arreef45.github.io/obs-scoreboard/manager/ using the existing GitHub Pages deployment from main. The root OBS HTML files remain available at their existing URLs.

To update: configure the project URL and publishable key in `web-manager/.env.local`, run `npm ci` and `npm run build` inside `web-manager`, then replace the contents of the root `manager/` directory with `web-manager/dist/` and commit the source and generated files together. Do not include `.env.local`, passwords or service-role keys. Publishable keys are included in the browser build by design.

The Supabase Auth endpoint accepts the configured publishable key, and all seven table endpoints deny anonymous access. Authenticated CRUD, storage policies and database functions still require verification with an administrator account. Sign in with the same account on desktop and mobile.
