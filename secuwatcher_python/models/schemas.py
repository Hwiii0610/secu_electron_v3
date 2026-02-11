"""
Pydantic 요청/응답 모델 및 API 예시 정의
"""
from typing import Optional
from pydantic import BaseModel, Field


class AutodetectRequest(BaseModel):
    """자동 탐지 / 선택 탐지 / 마스킹 내보내기 요청"""
    Event: str = Field(..., description="처리할 이벤트 유형 (1: 자동 탐지, 2: 선택 탐지, 3: 마스킹 내보내기, 4: 영역 마스킹)")
    VideoPath: str = Field(..., description="처리할 비디오 파일 경로 (쉼표로 여러 개 구분 가능)")
    FrameNo: Optional[str] = Field(None, description="Event 2에서 사용: 특정 프레임 번호")
    Coordinate: Optional[str] = Field(None, description="Event 2에서 사용: 선택 좌표 (x1,y1,x2,y2 형식)")
    AllMasking: Optional[str] = Field(None, description="Event 3에서 사용: 'yes'인 경우 전체 프레임 마스킹")


class AutoexportRequest(BaseModel):
    """일괄 처리 (탐지 + 마스킹 + 워터마킹) 요청"""
    VideoPaths: list = Field(..., description="처리할 비디오 파일 경로 목록")


# /autodetect 엔드포인트의 Swagger UI에 표시될 요청 예시
autodetect_examples = {
    "Event 1 (Auto Detect)": {
        "summary": "자동 객체 탐지 예시",
        "description": "Event 1은 지정된 비디오에서 설정된 객체를 자동으로 탐지합니다.",
        "value": {
            "Event": "1",
            "VideoPath": "video1.mp4,video2.mp4"
        }
    },
    "Event 2 (Select Detect)": {
        "summary": "선택 객체 탐지 예시",
        "description": "Event 2는 지정된 비디오의 특정 프레임과 좌표를 기반으로 객체를 탐지합니다.",
        "value": {
            "Event": "2",
            "VideoPath": "video.mp4",
            "FrameNo": "150",
            "Coordinate": "100,150,300,400"
        }
    },
    "Event 3 (Masking Export)": {
        "summary": "마스킹 내보내기 예시 (탐지 기반)",
        "description": "Event 3은 탐지된 객체에 마스킹을 적용하여 비디오를 내보냅니다. VideoPath는 보통 탐지 결과 JSON/CSV 파일 경로입니다.",
        "value": {
            "Event": "3",
            "VideoPath": "results/detection_output.json",
            "AllMasking": "no"
        }
    },
    "Event 3 (All Frame Masking)": {
        "summary": "전체 프레임 마스킹 내보내기 예시",
        "description": "Event 3에서 AllMasking='yes'로 설정하면 전체 비디오 프레임에 마스킹을 적용합니다. VideoPath는 원본 비디오 경로입니다.",
        "value": {
            "Event": "3",
            "VideoPath": "original/video.mp4",
            "AllMasking": "yes"
        }
    }
}
