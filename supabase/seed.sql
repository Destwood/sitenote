insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token,
  is_sso_user,
  is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  seed.id,
  'authenticated',
  'authenticated',
  seed.email,
  extensions.crypt('sitenote-dev-password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', seed.full_name, 'email_verified', true),
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  false,
  false
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'owner@sitenote.test', 'Olena Owner'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'member@sitenote.test', 'Max Member'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'guest@sitenote.test', 'Gina Guest'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'outsider@sitenote.test', 'Ollie Outsider')
) as seed (id, email, full_name);

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email in (
  'owner@sitenote.test',
  'member@sitenote.test',
  'guest@sitenote.test',
  'outsider@sitenote.test'
);

insert into public.workspaces (id, name, owner_id)
values (
  '10000000-0000-4000-8000-000000000001',
  'Northwind Studio',
  '00000000-0000-4000-8000-000000000001'
);

insert into public.members (workspace_id, user_id, role)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'member'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'guest');

insert into public.sites (id, workspace_id, origin)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'http://127.0.0.1:4173'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'http://localhost:4173'
  );

insert into public.threads (
  id,
  workspace_id,
  site_id,
  page_url,
  anchor,
  status,
  context,
  created_by,
  resolved_by,
  resolved_at,
  created_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'http://127.0.0.1:4173',
    $json${
      "kind": "element",
      "selectors": {
        "css": "#cta",
        "nthPath": "body > main:nth-of-type(1) > section:nth-of-type(1) > button:nth-of-type(1)",
        "id": "cta"
      },
      "fingerprint": {
        "tag": "button",
        "text": "Book a call",
        "classes": ["cta"],
        "width": 127,
        "height": 50
      },
      "offset": { "x": 0.5, "y": 0.5 }
    }$json$::jsonb,
    'open',
    $json${
      "viewport": { "width": 414, "height": 896 },
      "devicePixelRatio": 2,
      "browser": "Chrome 156",
      "os": "Windows 11",
      "title": "Northwind Studio"
    }$json$::jsonb,
    '00000000-0000-4000-8000-000000000002',
    null,
    null,
    now() - interval '3 days'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'http://127.0.0.1:4173',
    $json${
      "kind": "text",
      "quote": {
        "exact": "redesign of a logistics dashboard",
        "prefix": "k\n        \n        \n          A ",
        "suffix": " that cut the time to create a s"
      },
      "position": { "start": 839, "end": 872 },
      "container": "#work > p"
    }$json$::jsonb,
    'open',
    $json${
      "viewport": { "width": 1280, "height": 800 },
      "devicePixelRatio": 1,
      "browser": "Chrome 156",
      "os": "macOS 15",
      "title": "Northwind Studio"
    }$json$::jsonb,
    '00000000-0000-4000-8000-000000000003',
    null,
    null,
    now() - interval '2 days'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'http://127.0.0.1:4173',
    $json${
      "kind": "element",
      "selectors": {
        "css": "div.cards > article:nth-of-type(2)",
        "nthPath": "body > main:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > article:nth-of-type(2)"
      },
      "fingerprint": {
        "tag": "article",
        "text": "Design systems Tokens, components and documentation that keep large teams consistent.",
        "classes": ["card"],
        "width": 350,
        "height": 139
      },
      "offset": { "x": 0.5, "y": 0.5 }
    }$json$::jsonb,
    'open',
    $json${
      "viewport": { "width": 414, "height": 896 },
      "devicePixelRatio": 2,
      "browser": "Chrome 156",
      "os": "Windows 11",
      "title": "Northwind Studio"
    }$json$::jsonb,
    '00000000-0000-4000-8000-000000000001',
    null,
    null,
    now() - interval '1 day'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'http://127.0.0.1:4173',
    $json${
      "kind": "element",
      "selectors": {
        "css": "h1",
        "nthPath": "body > main:nth-of-type(1) > section:nth-of-type(1) > h1:nth-of-type(1)"
      },
      "fingerprint": {
        "tag": "h1",
        "text": "Design that ships with your product",
        "classes": [],
        "width": 350,
        "height": 166
      },
      "offset": { "x": 0.1143, "y": 0.1208 }
    }$json$::jsonb,
    'resolved',
    $json${
      "viewport": { "width": 414, "height": 896 },
      "devicePixelRatio": 2,
      "browser": "Chrome 156",
      "os": "Windows 11",
      "title": "Northwind Studio"
    }$json$::jsonb,
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    now() - interval '12 hours',
    now() - interval '5 days'
  );

insert into public.comments (id, thread_id, workspace_id, author_id, body, mentions, created_at)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'The contrast of this button is too low on the blue background.',
    '{}',
    now() - interval '3 days'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Agreed, I will switch it to the darker blue from the style guide.',
    '{}',
    now() - interval '3 days' + interval '2 hours'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'Could we name the client in this case study?',
    '{}',
    now() - interval '2 days'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Good point. Max, can you check whether we are allowed to?',
    array['00000000-0000-4000-8000-000000000002']::uuid[],
    now() - interval '2 days' + interval '1 hour'
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'Checked with legal: we can name them from next month.',
    '{}',
    now() - interval '2 days' + interval '5 hours'
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'This card has more text than the other two, the heights do not line up.',
    '{}',
    now() - interval '1 day'
  ),
  (
    '40000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'The headline wraps awkwardly on my phone.',
    '{}',
    now() - interval '5 days'
  ),
  (
    '40000000-0000-4000-8000-000000000008',
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Fixed by shortening the line. Resolving.',
    '{}',
    now() - interval '12 hours'
  );
