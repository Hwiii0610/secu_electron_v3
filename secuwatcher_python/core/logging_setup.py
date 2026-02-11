"""
로깅 설정 모듈
- 일별 로그 파일 경로 계산
- logging.basicConfig 설정
"""
import os
import sys
import logging
from datetime import datetime
from util import get_resource_path, get_log_dir


def setup_logging():
    """
    로깅 인프라를 초기화하고 (daily_log_path, video_log_path)를 반환.
    """
    date_str = datetime.now().strftime("%Y%m%d")

    # 1) Daily Log (기본 API/터미널 로그)
    daily_dir = get_log_dir('Daily Log')
    daily_log_path = os.path.join(daily_dir, f"{date_str}_log.txt")

    # 2) Video Log (마스킹/워터마킹/암복호화 등 영상 처리 로그)
    video_dir = get_log_dir('Video Log')
    video_log_path = os.path.join(video_dir, f"{date_str}_video.txt")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(daily_log_path, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )

    return daily_log_path, video_log_path
