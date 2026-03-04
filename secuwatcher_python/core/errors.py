"""[UIUX-40] 구조화된 API 에러 응답 헬퍼"""
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

def api_error(status_code: int, code: str, message: str, suggestion: str = None, context: dict = None):
    """구조화된 API 에러를 발생시킵니다.

    Args:
        status_code: HTTP 상태 코드
        code: 에러 코드 (예: "FILE_NOT_FOUND")
        message: 사용자 친화적 메시지 (한국어)
        suggestion: 해결 방법 제안 (선택)
        context: 추가 컨텍스트 정보 (선택, 디버깅용)
    """
    detail = {"code": code, "message": message}
    if suggestion:
        detail["suggestion"] = suggestion
    if context:
        detail["context"] = context
    logger.error(f"API Error [{code}]: {message}")
    raise HTTPException(status_code=status_code, detail=detail)
