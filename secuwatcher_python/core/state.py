"""
전역 공유 상태 관리
- jobs: 모든 비동기 작업의 상태를 추적하는 딕셔너리
- log_queue: 비동기 로그 쓰기를 위한 큐
"""
import util
from typing import Deque
from collections import deque
from util import logLine

# 전역 작업 상태 딕셔너리 (모든 라우터에서 공유)
jobs: dict = {}
util.jobs = jobs

# 전역 로그 큐
log_queue: Deque[logLine] = deque()
