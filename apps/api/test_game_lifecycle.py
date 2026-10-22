import urllib.request, json
from uuid import UUID

def run_lifecycle():
    # 1. Login
    login_data = json.dumps({'identifier': 'alex.johnson@eedi.com', 'password': 'Eedi@2026'}).encode()
    req = urllib.request.Request('http://127.0.0.1:8000/api/v1/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
        token = res['data']['accessToken']
        user = res['data']['user']
        print(f"1. Logged in: {user['name']} ({user['id']})")

    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 2. Get Games
    req = urllib.request.Request('http://127.0.0.1:8000/api/v1/student/games', headers=headers)
    with urllib.request.urlopen(req) as r:
        games = json.loads(r.read())['data']['games']
        game = games[0]
        game_id = game['id']
        print(f"2. Selected game: {game['title']} (ID: {game_id})")

    # 3. Start attempt
    req = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/student/games/{game_id}/start', data=b'{}', headers=headers)
    with urllib.request.urlopen(req) as r:
        start_res = json.loads(r.read())['data']
        attempt_id = start_res['attemptId']
        first_q = start_res['firstQuestion']
        print(f"3. Started attempt: {attempt_id}, first question: {first_q['question']}")

    # 4. Submit Answer
    qid = first_q.get('id') or first_q.get('question_id')
    ans_payload = json.dumps({
        'question_id': qid,
        'selected_option': 0,
        'response_time_ms': 4200
    }).encode()
    req = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/student/games/{attempt_id}/submit', data=ans_payload, headers=headers)
    with urllib.request.urlopen(req) as r:
        ans_res = json.loads(r.read())['data']
        print(f"4. Submitted answer. Result: isCorrect={ans_res['isCorrect']}, scoreEarned={ans_res['scoreEarned']}, nextDiff={ans_res['nextDifficulty']}")

    # 5. Finish attempt
    finish_payload = json.dumps({
        'duration_seconds': 45
    }).encode()
    req = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/student/games/{attempt_id}/finish', data=finish_payload, headers=headers)
    with urllib.request.urlopen(req) as r:
        fin_res = json.loads(r.read())['data']
        print(f"5. Attempt finished! Status: {fin_res['status']}, Raw Score: {fin_res['rawScore']}, EEDI: {fin_res['finalEedi']}, XP: {fin_res['xpEarned']}")

    # 6. Get attempt report
    req = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/student/games/{attempt_id}/report', headers=headers)
    with urllib.request.urlopen(req) as r:
        rep_res = json.loads(r.read())['data']
        attempt_data = rep_res['attempt']
        print(f"6. Report generated! Correct: {attempt_data.get('correct_answers')}/{attempt_data.get('total_questions')}, Answers count: {len(rep_res['answers'])}, Final EEDI: {rep_res['finalEedi']}")

    print("\nALL LIFECYCLE STEPS COMPLETED AND PERSISTED TO POSTGRESQL!")

if __name__ == '__main__':
    run_lifecycle()

