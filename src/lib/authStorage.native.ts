/**
 * iOS/Android에서만 로드되는 파일 (파일명의 .native가 그 역할을 한다).
 * expo-sqlite 기반 localStorage 폴리필을 설치해 로그인 세션을 기기에 저장한다.
 */
import 'expo-sqlite/localStorage/install';
