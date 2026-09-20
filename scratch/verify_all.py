import http.client, json, time, sys

def login(email, password='Eedi@2026'):
    conn = http.client.HTTPConnection('127.0.0.1', 8000, timeout=10)
    body = json.dumps({'identifier': email, 'password': password})
    conn.request('POST', '/api/v1/auth/login', body=body, headers={'Content-Type': 'application/json'})
    res = conn.getresponse()
    data = json.loads(res.read().decode())
    conn.close()
    if not data.get('success'):
        print(f'Login failed for {email}: {data}', flush=True)
        return None
    return data['data']['accessToken']

def req(path, token=None, timeout=15):
    t0 = time.time()
    conn = http.client.HTTPConnection('127.0.0.1', 8000, timeout=timeout)
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        conn.request('GET', path, headers=headers)
        res = conn.getresponse()
        body = res.read().decode()
        dur = time.time() - t0
        conn.close()
        return res.status, dur, body
    except Exception as e:
        conn.close()
        return -1, time.time() - t0, str(e)

print('=== 1. UNAUTHENTICATED TESTS (Should all be 401) ===', flush=True)
unauth_endpoints = [
    '/api/v1/trainer/dashboard',
    '/api/v1/admin/dashboard',
    '/api/v1/hod/dashboard',
    '/api/v1/notifications/unread-count',
    '/api/v1/student/ebooks',
    '/api/v1/student/ebooks/my-uploads',
]
for ep in unauth_endpoints:
    st, dur, b = req(ep)
    print(f'{ep:38} -> HTTP {st} in {dur:.2f}s', flush=True)

print('\n=== LOGGING IN DEMO USERS ===', flush=True)
s_token = login('alex.johnson@eedi.com')
t_token = login('r.bose@abcengg.edu')
h_token = login('priya.kulkarni@abcengg.edu')
a_token = login('rishabh.kumawat@abcengg.edu')

print('\n=== 2. ROLE & SCOPE ENFORCEMENT (Should be 403) ===', flush=True)
st, dur, _ = req('/api/v1/hod/dashboard', s_token)
print(f'Student accessing /hod/dashboard      -> HTTP {st} in {dur:.2f}s (Expected 403)', flush=True)
st, dur, _ = req('/api/v1/admin/dashboard', t_token)
print(f'Trainer accessing /admin/dashboard    -> HTTP {st} in {dur:.2f}s (Expected 403)', flush=True)

print('\n=== 3. AUTHORIZED TESTS (Should all be 200) ===', flush=True)
auth_tests = [
    ('Trainer Dashboard', '/api/v1/trainer/dashboard', t_token),
    ('Admin Dashboard', '/api/v1/admin/dashboard', a_token),
    ('HOD Dashboard', '/api/v1/hod/dashboard', h_token),
    ('Notifications (Student)', '/api/v1/notifications/unread-count', s_token),
    ('Notifications (HOD)', '/api/v1/notifications/unread-count', h_token),
    ('Student eBooks List', '/api/v1/student/ebooks', s_token),
    ('Student eBooks My Uploads', '/api/v1/student/ebooks/my-uploads', s_token),
]
for name, ep, tk in auth_tests:
    st, dur, b = req(ep, tk, timeout=20)
    print(f'{name:28} ({ep}) -> HTTP {st} in {dur:.2f}s (len: {len(b)})', flush=True)

