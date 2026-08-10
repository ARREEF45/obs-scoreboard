# OBS Scoreboard

## วิธีใช้งาน

1. คลิกขวา `start-scoreboard.ps1` แล้วเลือก **Run with PowerShell**
2. เปิด `http://localhost:8080/control.html` เพื่อควบคุม
3. ใน OBS เพิ่ม **Browser Source** แล้วใส่ URL `http://localhost:8080/display.html`
4. ตั้งขนาด Browser Source แนะนำเป็น `1280 × 720`

## สกอร์บอร์ดด้านบน

หากต้องการกราฟิกขนาดเล็กบริเวณด้านบน ให้เพิ่ม Browser Source แบบ **Local file** แล้วเลือก `display-top.html` ไฟล์นี้จะแสดงชื่อทีม สกอร์ เวลา ช่วงการแข่งขัน และทดเวลาเมื่อเลือก checkbox ในหน้า Control

## ไฟล์แสดงผลรวม

แนะนำให้ OBS ใช้ Browser Source แบบ **Local file** เพียงรายการเดียว แล้วเลือก `display-combined.html` จากนั้นเปิดหรือปิดสกอร์บอร์ดด้านล่างและด้านบนได้จากหัวข้อ **การแสดงผลใน OBS** ภายใน `control.html`

## การดวลจุดโทษ

ใน `control.html` ใช้หัวข้อ **ดวลจุดโทษ** เพื่อบันทึกผลเข้า/ไม่เข้า ย้อนผลล่าสุด หรือรีเซ็ตทั้งหมด แล้วเลือก **แสดงกราฟิกดวลจุดโทษ** เพื่อเปิดกราฟิกใน `display-combined.html`

เปิดหน้าต่าง PowerShell ค้างไว้ระหว่างใช้งาน หากไม่พบคำสั่ง `python` ต้องติดตั้ง Python ก่อน
