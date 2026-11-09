#!/bin/bash
# 웹 정적 빌드를 만들어서 Vercel(같은 프로덕션 URL)에 배포한다.
# expo export가 dist/를 통째로 새로 만들면서 .vercel(프로젝트 연결)/.vercelignore/vercel.json이
# 매번 같이 사라지고, 아이콘 폰트가 "assets/node_modules/..." 경로에 들어가는 바람에 Vercel이
# node_modules라는 이름의 폴더를 자동으로 배포에서 빼버려서 아이콘이 깨지는 문제가 있었다
# (2026-09-17 확인) — 그래서 매번 이 스크립트로 통일해서 같은 순서를 반복한다.
set -euo pipefail
cd "$(dirname "$0")/.."

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "1/4 웹 빌드 생성 중..."
npx expo export -p web

echo "2/4 아이콘 폰트 경로 수정 중 (Vercel이 node_modules 폴더를 자동 제외하는 문제 회피)..."
cd dist
if [ -d "assets/node_modules" ]; then
  mv assets/node_modules assets/vendor-modules
  JSFILE=$(find _expo -name "*.js" | head -1)
  sed -i '' 's#assets/node_modules#assets/vendor-modules#g' "$JSFILE"
fi
cd ..

echo "3/4 Vercel 설정 파일 복원 중..."
cp vercel.deploy-config.json.bak dist/vercel.json
cp vercel-ignore-config.bak dist/.vercelignore

echo "4/4 Vercel에 배포 중..."
npx vercel dist --prod --yes

echo "완료! https://dist-zeta-drab-3952qfifii.vercel.app 로 확인하세요."
