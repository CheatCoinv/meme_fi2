Donate: https://hatd.github.io/

# Tool: 


# Môi trường: 
    - nodejs 20.17.0
        - cài đặt nvm: https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows
        - cài đặt nodejs(mở cmd):
            - nvm install 20.17.0
            - nvm use 20.17.0

# Chuẩn bị:
    - file .env: đổi tên file `.example env` thành `.env`
    - file database.csv: 
        - tạo file database.csv
        - tên các cột lấy theo file csv_header.js
        - khi file mở bằng nodepad hoặc vscode, thì các trường phải cách nhau bằng dấu phẩy(,) mới chính xác. Nếu dùng excel, thì chuyển ngôn ngữ, vùng sang english
        - điền:
            - id: tăng dần từ 1, không trùng
            - active: 1 là sẽ chạy acc đó, khác 1 là không chạy
            - proxy: định dạng http://user:pass@ip:port, socks5://user:pass@ip:port
            - tele_data: link của popup của bot
    - cài đặt: lần đầu lấy tool về hoặc có thử viện mới, cần chạy: npm install

# Chạy:
    - node index.js: ra các option để chọn
    - node schedule.js: treo để chạy 1 option nào đó liên tục

# 24-9
- schedule: gồm spin + turbo tap
- check thêm lỗi rate limit

# 25-9
- thêm file spin_main_account. Spin acc có id =1, không reborn boss tránh limit

# 26-9
- Sửa lại do task
Những task nào mà claim lỗi: Forbidden, Could not find registered user with given telegram id. Thì những task
này cần phải sub, follow, chơi ở 1 bên khác, cần làm thật, nên claim sẽ lỗi. Thêm campaign id vào IGNORE_CAMPAIGN

# 26-10

    - thêm 7. Check air

# 27-10
(database có thay đổi)
(có thêm thư viện)

    - thêm 8.Okx sui wallet
        - Đây hoàn toàn là connect ví sui thông thường, không cần liên hết với okx
        - Nếu chắc cú, có thể import ví vào okx wallet
        - sui_private_key: là dạng suiprivkey...

# 13-11
  - Thêm chạy 4xx task youtube
        