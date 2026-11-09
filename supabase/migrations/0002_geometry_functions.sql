-- SPEC.md 4번: "저장/조회는 일반 insert/select가 아니라 전용 Postgres 함수(RPC) 2개를 통해 처리"
-- ① 좌표 배열 → geometry 저장용  ② geometry → GeoJSON 조회용

-- postgis 함수·타입이 extensions 스키마에 있어서 검색 경로에 추가한다 (0001과 동일 이유).
set search_path = public, extensions;

-- ① 좌표 배열을 3D LineString geometry로 변환한다.
-- coords 형식: [[lng, lat, elevation], [lng, lat, elevation], ...] (JSON 배열)
-- course.geometry와 running_record.actual_path 둘 다 이 함수로 만든다.
create or replace function public.linestring_z_from_coords(coords jsonb)
returns geometry(LineStringZ, 4326)
language sql
immutable
as $$
  select st_setsrid(
    st_makeline(
      array(
        select st_makepoint(
          (point->>0)::double precision, -- lng
          (point->>1)::double precision, -- lat
          coalesce((point->>2)::double precision, 0) -- elevation, 없으면 0
        )
        from jsonb_array_elements(coords) as point
      )
    ),
    4326
  );
$$;

-- ② course의 경로를 GeoJSON으로 조회한다 (지도 라이브러리가 바로 그릴 수 있는 형식).
create or replace function public.course_geojson(p_course_id uuid)
returns jsonb
language sql
stable
as $$
  select st_asgeojson(geometry)::jsonb
  from public.course
  where id = p_course_id;
$$;
