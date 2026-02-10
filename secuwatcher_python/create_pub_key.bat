@echo off
REM 1) 평문 키 파일 생성
set plain="abcdefghijklmnop"
echo %plain% | > plain.txt
certutil -encode plain.txt plain.bin

REM 2) RSA-OAEP 암호화 (SHA-1 해시, MGF1-SHA1) -> encrypted.bin
openssl pkeyutl -encrypt ^
  -pubin -inkey D:\dev\Masking\pubkey.pem ^
  -in plain.bin ^
  -pkeyopt rsa_padding_mode:oaep ^
  -pkeyopt rsa_oaep_md:sha1 ^
  -out encrypted.bin

REM 3) Base64 한 줄 출력 (newline 없이) -> encrypted.b64
openssl base64 -in encrypted.bin -A > encrypted.b64

echo.
echo [결과] encrypted.b64 파일이 생성되었습니다. 파일 내용을 Postman Environment 변수 ENC_KEY_B64에 붙여넣으세요.
pause
