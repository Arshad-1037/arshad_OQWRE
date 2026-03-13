from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import json
import os
import sys

# Ensure backend directory is in path and adjust template/static folders
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(backend_dir)
sys.path.append(backend_dir)

from database import get_db_connection, init_db

app = Flask(__name__, 
            template_folder=os.path.join(project_dir, 'frontend', 'templates'),
            static_folder=os.path.join(project_dir, 'frontend', 'static'))
app.secret_key = 'aoqrwe_super_secret_key'

# Initialize DB on startup
init_db()

@app.route('/')
def index():
    if 'user_id' in session:
        if session.get('role') == 'admin':
            return redirect(url_for('admin_dashboard'))
        elif session.get('role') == 'teacher':
            return redirect(url_for('teacher_dashboard'))
        else:
            return redirect(url_for('student_dashboard'))
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    password = request.form.get('password')
    role_type = request.form.get('role_type') # 'student' or 'admin'
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ? AND role = ?', 
                        (username, password, role_type)).fetchone()
    conn.close()
    
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        if user['role'] == 'admin':
            return redirect(url_for('admin_dashboard'))
        elif user['role'] == 'teacher':
            return redirect(url_for('teacher_dashboard'))
        return redirect(url_for('student_dashboard'))
    else:
        flash('Invalid credentials or role', 'danger')
        return redirect(url_for('index', show_login=True))

@app.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    password = request.form.get('password')
    role_type = request.form.get('role_type') # Usually 'student'
    
    conn = get_db_connection()
    existing = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    
    if existing:
        flash('Username already exists!', 'danger')
        conn.close()
        return redirect(url_for('index', show_register=True))
        
    conn.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
                 (username, password, role_type))
    conn.commit()
    conn.close()
    
    flash('Registration successful! Please login.', 'success')
    return redirect(url_for('index', show_login=True))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/admin_dashboard')
def admin_dashboard():
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect(url_for('index'))
    
    conn = get_db_connection()
    subjects = conn.execute('SELECT * FROM subjects').fetchall()
    
    stats = {}
    stats['users'] = conn.execute("SELECT COUNT(*) as c FROM users WHERE role='student'").fetchone()['c']
    stats['subjects'] = conn.execute("SELECT COUNT(*) as c FROM subjects").fetchone()['c']
    stats['attempts'] = conn.execute("SELECT COUNT(*) as c FROM results").fetchone()['c']
    avg_row = conn.execute("SELECT AVG(CAST(score AS FLOAT)/CAST(total AS FLOAT)) * 100 as a FROM results WHERE total > 0").fetchone()
    stats['avg_score'] = round(avg_row['a'], 1) if avg_row['a'] else 0
    
    conn.close()
    
    return render_template('admin_dashboard.html', subjects=subjects, stats=stats)

@app.route('/admin/add_subject', methods=['POST'])
def add_subject():
    if 'user_id' not in session or session.get('role') not in ('admin', 'teacher'):
        return redirect(url_for('index'))
        
    name = request.form.get('name')
    description = request.form.get('description', '')
    time_limit = request.form.get('time_limit', 30)
    
    if name:
        conn = get_db_connection()
        try:
            conn.execute('INSERT INTO subjects (name, description, time_limit, created_by) VALUES (?, ?, ?, ?)', 
                         (name, description, time_limit, session['user_id']))
            conn.commit()
            flash('Subject Bank created successfully!', 'success')
        except sqlite3.IntegrityError:
            flash('Subject Bank already exists!', 'danger')
        finally:
            conn.close()
            
    if session.get('role') == 'teacher':
        return redirect(url_for('teacher_dashboard'))
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/delete_subject/<int:subject_id>', methods=['POST'])
def delete_subject(subject_id):
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect(url_for('index'))
        
    conn = get_db_connection()
    conn.execute('DELETE FROM subjects WHERE id = ?', (subject_id,))
    conn.commit()
    conn.close()
    
    flash('Subject Bank deleted.', 'success')
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/subject/<int:subject_id>')
def manage_questions(subject_id):
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect(url_for('index'))
        
    conn = get_db_connection()
    subject = conn.execute('SELECT * FROM subjects WHERE id = ?', (subject_id,)).fetchone()
    questions = conn.execute('SELECT * FROM questions WHERE subject_id = ?', (subject_id,)).fetchall()
    conn.close()
    
    if not subject:
        flash('Subject Bank not found.', 'danger')
        return redirect(url_for('admin_dashboard'))
        
    return render_template('manage_questions.html', subject=subject, questions=questions)

@app.route('/admin/subject/<int:subject_id>/add_question', methods=['POST'])
def add_question(subject_id):
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect(url_for('index'))
        
    question_text = request.form.get('question_text')
    option_a = request.form.get('option_a')
    option_b = request.form.get('option_b')
    option_c = request.form.get('option_c')
    option_d = request.form.get('option_d')
    correct_option = request.form.get('correct_option')
    
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO questions (subject_id, question_text, option_a, option_b, option_c, option_d, correct_option)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (subject_id, question_text, option_a, option_b, option_c, option_d, correct_option))
    conn.commit()
    conn.close()
    
    flash('Question added successfully!', 'success')
    return redirect(url_for('manage_questions', subject_id=subject_id))

@app.route('/admin/subject/<int:subject_id>/ai_generate', methods=['POST'])
def ai_generate(subject_id):
    if 'user_id' not in session or session.get('role') not in ('admin', 'teacher'):
        return redirect(url_for('index'))
    
    conn = get_db_connection()
    # Mock AI generation: Insert 1 dummy hardcoded question for demonstration
    conn.execute('''
        INSERT INTO questions (subject_id, question_text, option_a, option_b, option_c, option_d, correct_option)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (subject_id, "[AI Auto-Generated] What is the capital of France?", "Berlin", "London", "Paris", "Madrid", "C"))
    conn.commit()
    conn.close()
    
    flash('AI successfully generated 1 question based on the Subject name context!', 'success')
    return redirect(url_for('manage_questions', subject_id=subject_id))

@app.route('/admin/delete_question/<int:question_id>', methods=['POST'])
def delete_question(question_id):
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect(url_for('index'))
        
    conn = get_db_connection()
    question = conn.execute('SELECT subject_id FROM questions WHERE id = ?', (question_id,)).fetchone()
    
    if question:
        subject_id = question['subject_id']
        conn.execute('DELETE FROM questions WHERE id = ?', (question_id,))
        conn.commit()
        conn.close()
        flash('Question deleted.', 'success')
        return redirect(url_for('manage_questions', subject_id=subject_id))
    
    conn.close()
    return redirect(url_for('admin_dashboard'))

@app.route('/teacher_dashboard')
def teacher_dashboard():
    if 'user_id' not in session or session.get('role') not in ('teacher', 'admin'):
        return redirect(url_for('index'))
    
    conn = get_db_connection()
    stats = {}
    stats['users'] = conn.execute("SELECT COUNT(*) as c FROM users WHERE role='student'").fetchone()['c']
    
    # Teachers can only see subjects they created, Admins see all
    if session.get('role') == 'admin':
        subjects = conn.execute('SELECT * FROM subjects').fetchall()
        stats['subjects'] = conn.execute("SELECT COUNT(*) as c FROM subjects").fetchone()['c']
        stats['attempts'] = conn.execute("SELECT COUNT(*) as c FROM results").fetchone()['c']
        avg_row = conn.execute("SELECT AVG(CAST(score AS FLOAT)/CAST(total AS FLOAT)) * 100 as a FROM results WHERE total > 0").fetchone()
    else:
        subjects = conn.execute('SELECT * FROM subjects WHERE created_by = ?', (session['user_id'],)).fetchall()
        stats['subjects'] = len(subjects)
        
        # Teacher specific stats
        stats['attempts'] = conn.execute("SELECT COUNT(r.id) as c FROM results r JOIN subjects s ON r.subject_id = s.id WHERE s.created_by = ?", (session['user_id'],)).fetchone()['c']
        avg_row = conn.execute("SELECT AVG(CAST(r.score AS FLOAT)/CAST(r.total AS FLOAT)) * 100 as a FROM results r JOIN subjects s ON r.subject_id = s.id WHERE r.total > 0 AND s.created_by = ?", (session['user_id'],)).fetchone()
        
    stats['avg_score'] = round(avg_row['a'], 1) if avg_row and avg_row['a'] else 0
    conn.close()
    
    return render_template('admin_dashboard.html', subjects=subjects, is_teacher=True, stats=stats)

@app.route('/student_dashboard')
def student_dashboard():
    if 'user_id' not in session or session.get('role') != 'student':
        return redirect(url_for('index'))
        
    conn = get_db_connection()
    # Get subjects with question counts
    subjects = conn.execute('''
        SELECT s.*, COUNT(q.id) as question_count
        FROM subjects s
        LEFT JOIN questions q ON s.id = q.subject_id
        GROUP BY s.id
    ''').fetchall()
    
    # Get recent performance
    recent_results = conn.execute('''
        SELECT r.*, s.name as subject_name 
        FROM results r
        JOIN subjects s ON r.subject_id = s.id
        WHERE r.user_id = ?
        ORDER BY r.date_taken DESC
        LIMIT 5
    ''', (session['user_id'],)).fetchall()
    conn.close()
    
    chart_data = []
    # Reverse so oldest is first in the chart
    for r in reversed(recent_results):
        chart_data.append({
            'label': r['subject_name'],
            'percentage': (r['score'] / r['total']) * 100 if r['total'] > 0 else 0
        })
    
    return render_template('student_dashboard.html', subjects=subjects, recent_results=recent_results, chart_json=json.dumps(chart_data))

@app.route('/quiz/start/<int:subject_id>', methods=['POST'])
def start_quiz(subject_id):
    if 'user_id' not in session or session.get('role') != 'student':
        return redirect(url_for('index'))
        
    conn = get_db_connection()
    subject = conn.execute('SELECT * FROM subjects WHERE id = ?', (subject_id,)).fetchone()
    questions = conn.execute('SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM()', (subject_id,)).fetchall()
    conn.close()
    
    if not questions:
        flash('This subject has no questions yet.', 'warning')
        return redirect(url_for('student_dashboard'))
        
    # Serialize questions for frontend JS delivery
    questions_list = []
    for q in questions:
        questions_list.append({
            'id': q['id'],
            'text': q['question_text'],
            'options': {
                'A': q['option_a'],
                'B': q['option_b'],
                'C': q['option_c'],
                'D': q['option_d']
            }
        })
        
    session['current_quiz'] = {
        'subject_id': subject_id,
        'subject_name': subject['name'],
        'questions': questions_list,
        'start_time': None # Handled via client-side roughly or we can record serverside later
    }
    
    return render_template('quiz.html', subject=subject, questions_json=json.dumps(questions_list))

@app.route('/quiz/submit', methods=['POST'])
def submit_quiz():
    if 'user_id' not in session or session.get('role') != 'student':
        return redirect(url_for('index'))
        
    quiz_data = session.get('current_quiz')
    if not quiz_data:
        flash('No active quiz session found.', 'danger')
        return redirect(url_for('student_dashboard'))
        
    user_answers = request.json.get('answers', {})
    time_taken = request.json.get('time_taken', 0)
    tab_switches = request.json.get('tab_switches', 0)
    
    conn = get_db_connection()
    score = 0
    total = len(quiz_data['questions'])
    detailed_results = []
    
    for q_data in quiz_data['questions']:
        q_id = str(q_data['id'])
        user_opt = user_answers.get(q_id, None)
        
        # Fetch correct answer from DB for integrity
        db_q = conn.execute('SELECT correct_option FROM questions WHERE id = ?', (q_id,)).fetchone()
        correct_opt = db_q['correct_option'] if db_q else ''
        
        is_correct = (user_opt == correct_opt)
        if is_correct:
            score += 1
            
        detailed_results.append({
            'question_id': q_id,
            'question_text': q_data['text'],
            'user_answer': user_opt,
            'user_answer_text': q_data['options'].get(user_opt, 'Not Attempted') if user_opt else 'Not Attempted',
            'correct_answer': correct_opt,
            'correct_answer_text': q_data['options'].get(correct_opt, ''),
            'is_correct': is_correct
        })
        
    # Save result with anti-cheat log
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO results (user_id, subject_id, score, total, time_taken, detailed_answers, tab_switches)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (session['user_id'], quiz_data['subject_id'], score, total, time_taken, json.dumps(detailed_results), tab_switches))
    
    result_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Clear session
    session.pop('current_quiz', None)
    
    # Return JSON for JS redirect
    return jsonify({'status': 'success', 'redirect': url_for('view_result', result_id=result_id)})

@app.route('/result/<int:result_id>')
def view_result(result_id):
    if 'user_id' not in session or session.get('role') != 'student':
        return redirect(url_for('index'))
        
    conn = get_db_connection()
    result = conn.execute('''
        SELECT r.*, s.name as subject_name 
        FROM results r
        JOIN subjects s ON r.subject_id = s.id
        WHERE r.id = ? AND r.user_id = ?
    ''', (result_id, session['user_id'])).fetchone()
    conn.close()
    
    if not result:
        flash('Result not found or unauthorized.', 'danger')
        return redirect(url_for('student_dashboard'))
        
    details = json.loads(result['detailed_answers'])
    
    # Calculate grade
    percentage = (result['score'] / result['total']) * 100
    grade = 'F'
    if percentage >= 90: grade = 'A'
    elif percentage >= 80: grade = 'B'
    elif percentage >= 70: grade = 'C'
    elif percentage >= 60: grade = 'D'
    
    return render_template('result.html', result=result, details=details, grade=grade, percentage=percentage)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
