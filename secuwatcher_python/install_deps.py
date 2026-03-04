"""
SecuWatcher Python 의존성 설치 스크립트
requirements.txt (UTF-16 LE 인코딩)의 패키지를 Windows에서 올바르게 설치합니다.
"""
import sys
import os
import subprocess
import codecs
import tempfile
import shutil


def run_pip(*args, check=True):
    cmd = [sys.executable, '-m', 'pip', 'install'] + list(args)
    print(f"\n>>> {' '.join(cmd)}\n")
    result = subprocess.run(cmd)
    if check and result.returncode != 0:
        print(f"[오류] pip install 실패: {' '.join(args)}")
        sys.exit(1)
    return result.returncode == 0


def read_requirements_utf16(path):
    """UTF-16 LE BOM 인코딩된 requirements.txt를 읽어 줄 목록 반환"""
    try:
        with codecs.open(path, 'r', encoding='utf-16') as f:
            lines = [line.strip() for line in f.readlines()]
        return [l for l in lines if l]
    except Exception:
        # UTF-8 fallback
        with open(path, 'r', encoding='utf-8') as f:
            lines = [line.strip() for line in f.readlines()]
        return [l for l in lines if l]


def install_torchreid_from_source(commit='566a56a2cb255f59ba75aa817032621784df546a'):
    """
    torchreid를 GitHub에서 클론하고 setup.py를 패치하여 설치합니다.
    Cython 확장 컴파일이 필요 없도록 수정합니다 (Python 폴백 사용).
    """
    tmpdir = tempfile.mkdtemp(prefix='torchreid_')
    try:
        print(f"\n[torchreid] 소스 클론 중: {tmpdir}")
        url = 'https://github.com/KaiyangZhou/deep-person-reid.git'
        ret = subprocess.run(['git', 'clone', '--filter=blob:none', '--quiet', url, tmpdir])
        if ret.returncode != 0:
            print('[오류] torchreid git clone 실패')
            sys.exit(1)

        subprocess.run(['git', 'checkout', '-q', commit], cwd=tmpdir)

        # setup.py 패치: Cython 확장 빌드 제거 (Python 폴백 사용)
        setup_py = os.path.join(tmpdir, 'setup.py')
        with open(setup_py, 'r', encoding='utf-8') as f:
            content = f.read()

        patched = '''import os.path as osp
from setuptools import setup, find_packages

ext_modules = []


def readme():
    with open('README.rst') as f:
        content = f.read()
    return content


def find_version():
    version_file = 'torchreid/__init__.py'
    with open(version_file, 'r') as f:
        exec(compile(f.read(), version_file, 'exec'))
    return locals()['__version__']


def get_requirements(filename='requirements.txt'):
    here = osp.dirname(osp.realpath(__file__))
    with open(osp.join(here, filename), 'r') as f:
        requires = [line.replace('\\n', '') for line in f.readlines()]
    return requires


setup(
    name='torchreid',
    version=find_version(),
    description='A library for deep learning person re-ID in PyTorch',
    author='Kaiyang Zhou',
    license='MIT',
    long_description=readme(),
    url='https://github.com/KaiyangZhou/deep-person-reid',
    packages=find_packages(),
    install_requires=get_requirements(),
    keywords=['Person Re-Identification', 'Deep Learning', 'Computer Vision'],
    ext_modules=ext_modules
)
'''
        with open(setup_py, 'w', encoding='utf-8') as f:
            f.write(patched)

        print('[torchreid] setup.py 패치 완료 (Cython 빌드 제거)')

        # 설치
        ret = subprocess.run([
            sys.executable, '-m', 'pip', 'install', tmpdir, '--no-build-isolation', '--no-deps'
        ])
        if ret.returncode != 0:
            print('[오류] torchreid 설치 실패')
            sys.exit(1)
        print('[torchreid] 설치 완료')
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    req_path = os.path.join(here, 'requirements.txt')

    print('=' * 60)
    print('SecuWatcher 의존성 설치 시작')
    print('=' * 60)

    # requirements.txt 읽기 (UTF-16 처리)
    lines = read_requirements_utf16(req_path)

    # 특수 처리가 필요한 패키지 분류
    skip_prefixes = [
        'torch==', 'torchaudio==', 'torchvision==',
        'torchreid', 'tb-nightly',
        'av==',  # 바이너리 휠이 있는 버전으로 대체
    ]

    regular_packages = []
    for line in lines:
        if not line or line.startswith('#'):
            continue
        if any(line.startswith(p) for p in skip_prefixes):
            continue
        regular_packages.append(line)

    # Step 1: torchreid 빌드 의존성 사전 설치
    print('\n[1/5] torchreid 빌드 의존성 설치...')
    run_pip(
        'numpy==1.26.4', 'Cython==3.0.12', 'scipy==1.15.2',
        'Pillow==11.1.0', 'matplotlib==3.10.1', 'h5py==3.13.0',
        'opencv-python==4.11.0.86',
        'gdown==5.2.0', 'yacs==0.1.8', 'requests==2.32.3',
        'tqdm==4.67.1', 'future==1.0.0', 'tensorboard==2.19.0',
        'wheel', 'setuptools',
    )

    # Step 2: PyTorch CUDA 설치
    print('\n[2/5] PyTorch (CUDA 11.8) 설치...')
    run_pip(
        'torch==2.3.0+cu118', 'torchvision==0.18.0+cu118',
        '--extra-index-url', 'https://download.pytorch.org/whl/cu118',
    )

    # Step 3: torchreid 설치 (소스에서, Cython 없이)
    print('\n[3/5] torchreid 설치...')
    install_torchreid_from_source()

    # Step 4: av (바이너리 휠 버전 사용)
    print('\n[4/5] av (바이너리 휠) 설치...')
    run_pip('av==14.2.0', '--only-binary=:all:', check=False)

    # Step 5: 나머지 패키지 설치
    print('\n[5/5] 나머지 패키지 설치...')
    # 임시 UTF-8 requirements 파일 생성
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt',
                                    encoding='utf-8', delete=False) as tf:
        tf.write('\n'.join(regular_packages))
        tmp_req = tf.name

    try:
        run_pip('-r', tmp_req,
                '--extra-index-url', 'https://download.pytorch.org/whl/cu118')
    finally:
        os.unlink(tmp_req)

    print('\n' + '=' * 60)
    print('모든 패키지 설치 완료!')
    print('=' * 60)


if __name__ == '__main__':
    main()
