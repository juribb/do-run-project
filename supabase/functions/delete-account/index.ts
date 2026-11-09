/**
 * POST /delete-account
 * 요청한 본인 계정을 완전히 삭제한다. Supabase Auth는 auth.users 삭제를 service_role
 * 권한이 있는 Admin API(auth.admin.deleteUser)로만 허용해서, 클라이언트가 직접 못 하고
 * 이 Edge Function을 거쳐야 한다.
 *
 * auth.users를 삭제하면 profiles·running_record·course_reviews·course_report·
 * saved_courses·recommendation_request가 전부 `on delete cascade`로 같이 지워진다
 * (각 테이블 정의 참고 — 여기서 따로 지울 필요 없다). course/recommendation_candidate는
 * 여러 사용자가 같이 보는 공유 자산이라 삭제 대상이 아니다(생성자 참조만 남는다).
 *
 * avatars Storage 버킷의 프로필 사진 파일({user_id}/avatar.jpg)은 DB cascade 대상이
 * 아니라서(Storage 객체는 별도 시스템) auth.users 삭제만으로는 안 지워진다 — 개인정보
 * 처리방침에 "탈퇴 시 파기"라고 쓰려면 실제로 지워야 해서(2026-09-17, 개인정보처리방침
 * 작성 중 발견한 실제 삭제 누락), auth.users 삭제 "전에" 파일부터 지운다. 파일이
 * 없어도(프로필 사진을 등록한 적 없는 계정) 에러 없이 넘어가게 둔다.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 요청 헤더의 JWT로 "누가" 탈퇴를 요청했는지 확인한다 (RLS 우회 없이 본인 확인만).
    const supabaseAsUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseAsUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 프로필 사진부터 지운다 — 실패해도(파일이 아예 없는 경우 등) 탈퇴 자체는 막지 않는다.
    const { error: storageError } = await supabaseAdmin.storage.from('avatars').remove([`${user.id}/avatar.jpg`]);
    if (storageError) {
      console.error('[delete-account] 프로필 사진 삭제 실패(계속 진행)', storageError);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[delete-account] 삭제 실패', deleteError);
      return new Response(JSON.stringify({ error: '회원 탈퇴 처리에 실패했어요.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[delete-account] 처리 중 오류', e);
    return new Response(JSON.stringify({ error: '알 수 없는 오류가 발생했어요.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
