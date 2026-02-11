"""
SQLite 데이터베이스 관리
- DRM 정보 테이블 생성
- DRM 정보 삽입
"""
import os
import sqlite3
from util import get_resource_path

DB_FILE = get_resource_path("local.db")


def create_drm_table(db_path=None):
    """tb_drm_info 테이블이 없으면 생성"""
    if db_path is None:
        db_path = DB_FILE
    create_table_sql = '''
    CREATE TABLE IF NOT EXISTS tb_drm_info (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        file_hash TEXT,
        ori_file_name VARCHAR(100),
        org_filepath VARCHAR(256),
        masking_file_name VARCHAR(100),
        masking_status CHAR(10),
        enc_file_name VARCHAR(100),
        enc_status CHAR(10),
        play_date DATETIME,
        play_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    '''
    try:
        db_existed = os.path.exists(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(create_table_sql)
        conn.commit()
        conn.close()

        if db_existed:
            print("기존 DB 사용")
        else:
            print("DB 생성 완료")

    except Exception as e:
        print(f"DB를 호출 실패: {e}")


def insert_drm_info(
    file_hash, ori_file_name, org_filepath, masking_file_name,
    masking_status, enc_file_name, enc_status, play_date, play_count,
    db_path=None
):
    """DRM 정보를 tb_drm_info 테이블에 삽입"""
    if db_path is None:
        db_path = DB_FILE
    sql = '''
    INSERT INTO tb_drm_info (
        file_hash, ori_file_name, org_filepath, masking_file_name,
        masking_status, enc_file_name, enc_status, play_date, play_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    '''
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(sql, (
        file_hash, ori_file_name, org_filepath, masking_file_name,
        masking_status, enc_file_name, enc_status, play_date, play_count
    ))
    conn.commit()
    conn.close()
