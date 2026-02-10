import os
import sys
import time
import threading
from datetime import datetime
from collections import deque, defaultdict
import configparser

class logLine():
    def __init__(self, path: str = "", time: str = "", message: str = ""):
        # 생성 시 바로 경로·시간·메시지를 설정할 수 있도록 수정
        self.path = path
        self.time = time
        self.message = message

def timeToStr(tm, form='file'):
    tmObj = time.localtime(tm)
    if form == 'file':
        return "%04d%02d%02d%02d%02d%02d" % (
            tmObj.tm_year, tmObj.tm_mon, tmObj.tm_mday,
            tmObj.tm_hour, tmObj.tm_min, tmObj.tm_sec
        )
    else:
        return "%04d-%02d-%02d %02d:%02d:%02d" % (
            tmObj.tm_year, tmObj.tm_mon, tmObj.tm_mday,
            tmObj.tm_hour, tmObj.tm_min, tmObj.tm_sec
        )

def createFolder(directory):
    try:
        if not os.path.exists(directory):
            os.makedirs(directory)
    except OSError:
        print('Error: Creating directory. ' + directory)

def log_write(log_line):
    createFolder(os.path.dirname(log_line.path))
    line = "[" + log_line.time + "]\t" + log_line.message + "\n"
    with open(log_line.path, 'a') as f:
        f.write(line)
        f.flush()
    print(line, end="")

def log_writer(log_queue, log_path):
    """
    백그라운드에서 log_queue(deque)를 모니터링하며
    새로 들어온 logLine을 즉시 기록합니다.
    """
    while True:
        if not log_queue:
            time.sleep(0.1)
            continue
        entry = log_queue.popleft()
        # entry가 logLine 객체가 아닐 경우 log_path와 현재 시간을 사용하여 logLine 객체로 변환
        if not isinstance(entry, logLine):
            entry = logLine(
                path=log_path,
                time=timeToStr(time.time()),
                message=str(entry)
            )
        log_write(entry)

def get_resource_path(relative_path: str) -> str:
    """ PyInstaller 실행 환경에서도 리소스를 찾을 수 있게 경로를 보정합니다. """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.abspath(os.path.join(".", relative_path))

def get_log_dir(category: str) -> str:
    """
    [path].log 아래에 '<category>/<YYYYMMDD>/' 폴더를 만들어서 반환.
    category 예: 'Daily Log', 'AI Log', 'Video Log'
    최종 경로 예: C:\swfc\export\log\Daily Log\20251113
    """
    cfg_path = get_resource_path('config.ini')
    cfg = configparser.ConfigParser()
    cfg.read(cfg_path, encoding='utf-8')

    log_root = cfg.get('path', 'log', fallback='log')  # config.ini의 [path].log
    date_str = datetime.now().strftime("%Y%m%d")

    base_dir = os.path.join(log_root, category, date_str)
    createFolder(base_dir)
    return base_dir


jobs = None   # main.py에서 연결 예정
_job_locks = defaultdict(threading.Lock)

def _clamp01(x: float) -> float:
    try: x = float(x)
    except Exception: return 0.0
    if x > 1.0:
        if x <= 100.0: return x / 100.0
        return 1.0
    if x < 0.0: return 0.0
    return x

def update_progress(job_id, frac, start_pct=0, end_pct=100):
    """0~1 비율 + 구간 할당 + 단조증가 보장. jobs dict에 progress_raw 기록."""
    if jobs is None or job_id not in jobs: return
    s = max(0.0, min(100.0, float(start_pct))) / 100.0
    e = max(0.0, min(100.0, float(end_pct))) / 100.0
    if e < s: s, e = e, s
    f = _clamp01(frac)
    mapped = s + (e-s)*f
    with _job_locks[job_id]:
        prev = jobs[job_id].get("progress_raw", 0.0)
        if mapped < prev: mapped = prev
        jobs[job_id]["progress_raw"] = mapped