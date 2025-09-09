import os
from flask import Flask, request, jsonify, send_file, render_template
from supabase import create_client, Client
from dotenv import load_dotenv
import uuid
from datetime import datetime, timedelta, timezone
import io
from flask_cors import CORS

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
CORS(app)

def generate_admin_token():
    return str(uuid.uuid4())

def parse_expiry_datetime(expiry_str):
    """Parse ISO8601 datetime string and ensure it is timezone-aware in UTC."""
    dt = datetime.fromisoformat(expiry_str.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

@app.route('/')
def index():
    return render_template('index.html')

# Frontend route serving the same page for session URL
@app.route('/session/<session_id>')
def session_page(session_id):
    # Just serve the frontend HTML; frontend JS loads session data
    return render_template('index.html')

# API route to get session info
@app.route('/api/session/<session_id>', methods=['GET'])
def get_session(session_id):
    response = supabase.table('sessions').select('*').eq('id', session_id).execute()
    if not response.data or len(response.data) == 0:
        return jsonify({'error': 'Session not found'}), 404
    session = response.data[0]
    return jsonify({
        'name': session['name'],
        'expiry': session['expiry'],
        'active': session.get('active', False)
    })

# API route to create session
@app.route('/api/create-session', methods=['POST'])
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing JSON body'}), 400

    name = data.get('name')
    duration_minutes = data.get('duration_minutes')

    if not name or not duration_minutes:
        return jsonify({'error': 'Missing name or duration_minutes'}), 400

    try:
        duration_minutes = float(duration_minutes)
        if duration_minutes < 0.01:
            return jsonify({'error': 'duration_minutes must be at least 1'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid duration_minutes'}), 400

    expiry = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    admin_token = generate_admin_token()

    expiry_iso = expiry.isoformat(timespec='seconds').replace('+00:00', 'Z')

    response = supabase.table('sessions').insert({
        'name': name,
        'expiry': expiry_iso,
        'admin_token': admin_token,
        'active': True,
    }).execute()

    if not response.data or len(response.data) == 0:
        return jsonify({'error': 'Failed to create session'}), 500

    session_id = response.data[0]['id']

    return jsonify({
        'session_id': session_id,
        'admin_token': admin_token,
        'expiry': expiry_iso,
        'session_link': f"/session/{session_id}"
    })

# API route to add contact
@app.route('/api/session/<session_id>/add-contact', methods=['POST'])
def add_contact(session_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing JSON body'}), 400

    name = data.get('name')
    phone = data.get('phone')

    if not name or not phone:
        return jsonify({'error': 'Missing name or phone'}), 400

    response = supabase.table('sessions').select('*').eq('id', session_id).execute()
    if not response.data or len(response.data) == 0:
        return jsonify({'error': 'Session not found'}), 404

    session = response.data[0]

    if not session.get('active', False):
        return jsonify({'error': 'Session is not active'}), 403

    expiry_dt = parse_expiry_datetime(session['expiry'])
    if expiry_dt < datetime.now(timezone.utc):
        supabase.table('sessions').update({'active': False}).eq('id', session_id).execute()
        return jsonify({'error': 'Session has expired'}), 403

    resp = supabase.table('contacts').insert({
        'session_id': session_id,
        'name': name,
        'phone': phone
    }).execute()

    if not resp.data or len(resp.data) == 0:
        return jsonify({'error': 'Failed to add contact'}), 500

    return jsonify({'message': 'Contact added successfully'})

# API route to get contacts
@app.route('/api/session/<session_id>/contacts', methods=['GET'])
def get_contacts(session_id):
    response = supabase.table('contacts').select('*').eq('session_id', session_id).execute()
    if not response.data:
        return jsonify([])

    return jsonify(response.data)

def generate_vcf(contacts):
    vcf_lines = []
    for c in contacts:
        vcf_lines.append("BEGIN:VCARD")
        vcf_lines.append("VERSION:3.0")
        vcf_lines.append(f"N:{c['name']};;;;")
        vcf_lines.append(f"FN:{c['name']}")
        vcf_lines.append(f"TEL;TYPE=CELL:{c['phone']}")
        vcf_lines.append("END:VCARD")
    return "\n".join(vcf_lines)

# API route to download VCF file
@app.route('/api/session/<session_id>/download', methods=['GET'])
def download_vcf(session_id):
    session_resp = supabase.table('sessions').select('*').eq('id', session_id).execute()
    if not session_resp.data or len(session_resp.data) == 0:
        return jsonify({'error': 'Session not found'}), 404

    session = session_resp.data[0]

    expiry_dt = parse_expiry_datetime(session['expiry'])
    if session.get('active', False) and expiry_dt > datetime.now(timezone.utc):
        return jsonify({'error': 'Session is still active, cannot download yet'}), 403

    contacts_resp = supabase.table('contacts').select('*').eq('session_id', session_id).execute()
    if not contacts_resp.data:
        return jsonify({'error': 'Failed to fetch contacts or no contacts found'}), 500

    contacts = contacts_resp.data
    if not contacts:
        return jsonify({'error': 'No contacts found in this session'}), 404

    vcf_data = generate_vcf(contacts)
    buffer = io.BytesIO()
    buffer.write(vcf_data.encode('utf-8'))
    buffer.seek(0)

    return send_file(buffer,
                     as_attachment=True,
                     download_name=f"{session['name']}_contacts.vcf",
                     mimetype='text/vcard')

@app.errorhandler(Exception)
def handle_exception(e):
    code = getattr(e, 'code', 500)
    return jsonify(error=str(e)), code

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
