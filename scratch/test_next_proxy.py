import http.client, json, time

def login(email, password='Eedi@2026'):
    conn = http.client.HTTPConnection('localhost', 3000, timeout=15)
    body = json.dumps({'identifier': email, 'password': password})
    conn.request('POST', '/api/v1/auth/login', body=body, headers={'Content-Type': 'application/json'})
    res = conn.getresponse()
    data = json.loads(res.read().decode())
    conn.close()
    if not data.get('success'):
        print(f'Next.js Proxy Login failed for {email}: {data}', flush=True)
        return None
    return data['data']['accessToken']

def req_proxy(path, token=None, timeout=20):
    t0 = time.time()
    conn = http.client.HTTPConnection('localhost', 3000, timeout=timeout)
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

print('=== TESTING NEXT.JS PROXY (http://localhost:3000) ===', flush=True)

h_token = login('priya.kulkarni@abcengg.edu')
t_token = login('r.bose@abcengg.edu')
s_token = login('alex.johnson@eedi.com')
a_token = login('rishabh.kumawat@abcengg.edu')

proxy_tests = [
    ('HOD Dashboard via Next.js Proxy', '/api/v1/hod/dashboard', h_token),
    ('Admin Dashboard via Next.js Proxy', '/api/v1/admin/dashboard', a_token),
    ('Trainer Dashboard via Next.js Proxy', '/api/v1/trainer/dashboard', t_token),
    ('Notifications via Next.js Proxy', '/api/v1/notifications/unread-count', h_token),
    ('Student eBooks via Next.js Proxy', '/api/v1/student/ebooks', s_token),
    ('Student My Uploads via Next.js Proxy', '/api/v1/student/ebooks/my-uploads', s_token),
]

for name, path, token in proxy_tests:
    st, dur, b = req_proxy(path, token)
    print(f'{name:40} ({path}) -> HTTP {st} in {dur:.2f}s (len: {len(b)})', flush=True)

