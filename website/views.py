from flask import Blueprint, render_template, request, flash, redirect, url_for, jsonify, current_app
from flask_login import login_required, current_user
from .models import Post, User, Comment, Like, FriendRequest, Message
from . import db
from werkzeug.utils import secure_filename
import os
import uuid

# ── Cloudinary (optional — used on Vercel where filesystem is read-only) ──────
try:
    import cloudinary
    import cloudinary.uploader
    _CLOUDINARY_URL = os.getenv('CLOUDINARY_URL', '')
    if _CLOUDINARY_URL:
        cloudinary.config(cloudinary_url=_CLOUDINARY_URL)
        USE_CLOUDINARY = True
    else:
        USE_CLOUDINARY = False
except ImportError:
    USE_CLOUDINARY = False


def _upload_file(file_or_bytes, folder: str, public_id: str = None) -> str:
    """Upload a file object or bytes. Returns a URL (Cloudinary) or a static path (local)."""
    if USE_CLOUDINARY:
        opts = {'folder': f'thisisswater/{folder}', 'resource_type': 'auto'}
        if public_id:
            opts['public_id'] = public_id
        result = cloudinary.uploader.upload(file_or_bytes, **opts)
        return result['secure_url']
    else:
        # Local dev — file_or_bytes must be a file object with .filename
        file = file_or_bytes
        ext = getattr(file, 'filename', 'file.bin').rsplit('.', 1)[-1].lower()
        filename = f"{public_id or uuid.uuid4().hex[:12]}.{ext}"
        upload_dir = os.path.join(current_app.root_path, 'static', 'uploads', folder)
        os.makedirs(upload_dir, exist_ok=True)
        if isinstance(file, bytes):
            with open(os.path.join(upload_dir, filename), 'wb') as f:
                f.write(file)
        else:
            file.save(os.path.join(upload_dir, filename))
        return f'uploads/{folder}/{filename}'


def _delete_file(path_or_url: str):
    """Delete an uploaded file (local path or Cloudinary public_id)."""
    if not path_or_url:
        return
    if USE_CLOUDINARY and path_or_url.startswith('http'):
        try:
            # Extract public_id from URL: .../thisisswater/profiles/<id>.<ext>
            parts = path_or_url.rsplit('/', 1)[-1].rsplit('.', 1)[0]
            folder = 'profiles' if 'profiles' in path_or_url else 'dm'
            cloudinary.uploader.destroy(f'thisisswater/{folder}/{parts}')
        except Exception:
            pass
    else:
        # Local path like 'uploads/profiles/xxx.jpg'
        abs_path = os.path.join(current_app.root_path, 'static', path_or_url)
        if os.path.exists(abs_path):
            os.remove(abs_path)


def profile_pic_url(user):
    if user.profile_pic:
        # Cloudinary URLs are full https:// URLs; local paths need url_for
        if user.profile_pic.startswith('http'):
            return user.profile_pic
        return url_for('static', filename=user.profile_pic)
    return None


views = Blueprint("views", __name__)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_friend_status(viewer_id, target_id):
    if viewer_id == target_id:
        return 'self'

    accepted = FriendRequest.query.filter(
        ((FriendRequest.sender_id == viewer_id) & (FriendRequest.receiver_id == target_id)) |
        ((FriendRequest.sender_id == target_id) & (FriendRequest.receiver_id == viewer_id)),
        FriendRequest.status == 'accepted'
    ).first()
    if accepted:
        return 'friends'

    pending_sent = FriendRequest.query.filter_by(
        sender_id=viewer_id, receiver_id=target_id, status='pending'
    ).first()
    if pending_sent:
        return 'pending_sent'

    pending_received = FriendRequest.query.filter_by(
        sender_id=target_id, receiver_id=viewer_id, status='pending'
    ).first()
    if pending_received:
        return 'pending_received'

    return 'none'


def serialize_user_profile(user, viewer_id):
    posts = Post.query.filter_by(author=user.id).order_by(Post.date_created.desc()).all()
    return {
        'id': user.id,
        'username': user.username,
        'bio': user.bio or 'No bio yet.',
        'post_count': len(posts),
        'posts': [{
            'id': p.id,
            'text': p.text,
            'date': p.date_created.strftime('%b %d, %Y') if p.date_created else ''
        } for p in posts],
        'friend_status': get_friend_status(viewer_id, user.id)
    }


@views.route("/")
@views.route("/home")
@login_required
def home():
    posts = Post.query.order_by(Post.date_created.desc()).all()
    users = User.query.all()
    incoming_requests = FriendRequest.query.filter_by(
        receiver_id=current_user.id, status='pending'
    ).order_by(FriendRequest.date_created.desc()).all()
    return render_template(
        "home.html",
        user=current_user,
        posts=posts,
        users=users,
        incoming_requests=incoming_requests
    )


@views.route("/create-post", methods=['GET', 'POST'])
@login_required
def create_post():
    if request.method == "POST":
        text = request.form.get('text')

        if not text:
            flash('Post cannot be empty', category='error')
        else:
            post = Post(text=text, author=current_user.id)
            db.session.add(post)
            db.session.commit()
            flash('Post created!', category='success')
            return redirect(url_for('views.home'))

    return render_template('create_post.html', user=current_user)


@views.route("/delete-post/<id>")
@login_required
def delete_post(id):
    post = Post.query.filter_by(id=id).first()

    if not post:
        flash("Post does not exist.", category='error')
    elif current_user.id != post.author and current_user.username != os.getenv('ADMIN_USERNAME', 'Abiram'):
        flash('You do not have permission to delete this post.', category='error')
    else:
        db.session.delete(post)
        db.session.commit()
        flash('Post deleted.', category='success')

    return redirect(url_for('views.home'))


@views.route("/posts/<username>", methods=['GET', 'POST'])
@login_required
def posts(username):
    profile_user = User.query.filter_by(username=username).first()

    if not profile_user:
        flash('No user with that username exists.', category='error')
        return redirect(url_for('views.home'))

    if request.method == 'POST' and current_user.id == profile_user.id:
        bio = request.form.get('bio', '').strip()
        profile_user.bio = bio[:500]
        db.session.commit()
        flash('Bio updated!', category='success')
        return redirect(url_for('views.posts', username=username))

    user_posts = profile_user.posts
    incoming_requests = FriendRequest.query.filter_by(
        receiver_id=current_user.id, status='pending'
    ).order_by(FriendRequest.date_created.desc()).all()
    return render_template(
        "posts.html",
        user=current_user,
        posts=user_posts,
        username=username,
        profile_user=profile_user,
        incoming_requests=incoming_requests
    )


@views.route("/api/check-username")
@login_required
def check_username():
    """Check if a username is available (excluding the current user's own username)."""
    new_username = request.args.get('username', '').strip()
    if not new_username:
        return jsonify({'available': False, 'error': 'Username cannot be empty.'})
    if len(new_username) < 2:
        return jsonify({'available': False, 'error': 'Too short — minimum 2 characters.'})
    if len(new_username) > 150:
        return jsonify({'available': False, 'error': 'Too long — maximum 150 characters.'})
    if new_username == current_user.username:
        return jsonify({'available': False, 'error': "That's already your username."})

    existing = User.query.filter(
        User.username.ilike(new_username),
        User.id != current_user.id
    ).first()
    if existing:
        return jsonify({'available': False, 'error': 'That username is already taken.'})
    return jsonify({'available': True, 'message': f'"{new_username}" is available!'})


@views.route("/api/update-username", methods=['POST'])
@login_required
def update_username():
    data = request.get_json() or {}
    new_username = (data.get('username') or '').strip()

    if not new_username or len(new_username) < 2 or len(new_username) > 150:
        return jsonify({'error': 'Invalid username.'}), 400
    if new_username == current_user.username:
        return jsonify({'error': "That's already your username."}), 400

    existing = User.query.filter(
        User.username.ilike(new_username),
        User.id != current_user.id
    ).first()
    if existing:
        return jsonify({'error': 'That username is already taken.'}), 409

    old_username = current_user.username
    current_user.username = new_username
    db.session.commit()
    return jsonify({'message': f'Username changed from "{old_username}" to "{new_username}".',
                    'new_username': new_username})


@views.route("/api/search")
@login_required
def search_users():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'found': False, 'error': 'Enter a username to search.'}), 400

    target = User.query.filter(User.username.ilike(f'%{query}%')).first()
    if not target:
        return jsonify({'found': False, 'error': 'No user found with that username.'}), 404

    return jsonify({'found': True, 'user': serialize_user_profile(target, current_user.id)})


@views.route("/api/suggestions")
@login_required
def get_suggestions():
    # Get all user IDs that already have any request with current user
    all_reqs = FriendRequest.query.filter(
        (FriendRequest.sender_id == current_user.id) |
        (FriendRequest.receiver_id == current_user.id)
    ).all()
    exclude_ids = {current_user.id}
    for r in all_reqs:
        exclude_ids.add(r.sender_id)
        exclude_ids.add(r.receiver_id)

    suggestions = User.query.filter(~User.id.in_(exclude_ids)).order_by(User.username).limit(4).all()

    result = []
    for u in suggestions:
        result.append({
            'id': u.id,
            'username': u.username,
            'profile_pic': url_for('static', filename=u.profile_pic) if u.profile_pic else None,
            'post_count': len(u.posts)
        })

    return jsonify({'suggestions': result})


@views.route("/api/friend-request/send", methods=['POST'])
@login_required
def send_friend_request():
    data = request.get_json() or {}
    user_id = data.get('user_id')

    if not user_id:
        return jsonify({'error': 'User is required.'}), 400

    target = db.session.get(User, int(user_id))
    if not target:
        return jsonify({'error': 'User not found.'}), 404
    if target.id == current_user.id:
        return jsonify({'error': 'You cannot send a friend request to yourself.'}), 400

    status = get_friend_status(current_user.id, target.id)
    if status == 'friends':
        return jsonify({'error': 'You are already friends.'}), 400
    if status == 'pending_sent':
        return jsonify({'error': 'Friend request already sent.'}), 400
    if status == 'pending_received':
        return jsonify({'error': 'This user already sent you a request. Check your notifications.'}), 400

    friend_request = FriendRequest(
        sender_id=current_user.id,
        receiver_id=target.id,
        status='pending'
    )
    db.session.add(friend_request)
    db.session.commit()

    return jsonify({
        'message': f'Friend request sent to {target.username}.',
        'friend_status': 'pending_sent'
    })


@views.route("/api/friend-request/<int:request_id>/accept", methods=['POST'])
@login_required
def accept_friend_request(request_id):
    friend_request = db.session.get(FriendRequest, request_id)
    if not friend_request or friend_request.receiver_id != current_user.id:
        return jsonify({'error': 'Friend request not found.'}), 404
    if friend_request.status != 'pending':
        return jsonify({'error': 'This request is no longer pending.'}), 400

    friend_request.status = 'accepted'
    db.session.commit()
    return jsonify({'message': f'You are now friends with {friend_request.sender.username}.'})


@views.route("/api/friend-request/<int:request_id>/decline", methods=['POST'])
@login_required
def decline_friend_request(request_id):
    friend_request = db.session.get(FriendRequest, request_id)
    if not friend_request or friend_request.receiver_id != current_user.id:
        return jsonify({'error': 'Friend request not found.'}), 404
    if friend_request.status != 'pending':
        return jsonify({'error': 'This request is no longer pending.'}), 400

    friend_request.status = 'declined'
    db.session.commit()
    return jsonify({'message': 'Friend request declined.'})


@views.route("/create-comment/<post_id>", methods=['POST'])
@login_required
def create_comment(post_id):
    text = request.form.get('text')

    if not text:
        flash('Comment cannot be empty.', category='error')
    else:
        post = Post.query.filter_by(id=post_id).first()
        if post:
            comment = Comment(
                text=text, author=current_user.id, post_id=post_id)
            db.session.add(comment)
            db.session.commit()
        else:
            flash('Post does not exist.', category='error')

    return redirect(url_for('views.home'))


@views.route("/delete-comment/<comment_id>")
@login_required
def delete_comment(comment_id):
    comment = Comment.query.filter_by(id=comment_id).first()

    if not comment:
        flash('Comment does not exist.', category='error')
    elif current_user.id != comment.author and current_user.id != comment.post.author and current_user.username != os.getenv('ADMIN_USERNAME', 'Abiram'):
        flash('You do not have permission to delete this comment.', category='error')
    else:
        db.session.delete(comment)
        db.session.commit()

    return redirect(url_for('views.home'))


@views.route("/like-post/<post_id>", methods=['POST'])
@login_required
def like(post_id):
    post = Post.query.filter_by(id=post_id).first()
    like = Like.query.filter_by(
        author=current_user.id, post_id=post_id).first()

    if not post:
        return jsonify({'error': 'Post does not exist.'}, 400)
    elif like:
        db.session.delete(like)
        db.session.commit()
    else:
        like = Like(author=current_user.id, post_id=post_id)
        db.session.add(like)
        db.session.commit()

    return jsonify({"likes": len(post.likes), "liked": current_user.id in map(lambda x: x.author, post.likes)})


def are_friends(user1_id, user2_id):
    from .models import FriendRequest
    fr = FriendRequest.query.filter(
        ((FriendRequest.sender_id == user1_id) & (FriendRequest.receiver_id == user2_id)) |
        ((FriendRequest.sender_id == user2_id) & (FriendRequest.receiver_id == user1_id)),
        FriendRequest.status == 'accepted'
    ).first()
    return fr is not None


@views.route("/api/messages")
@login_required
def get_messages():
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({'error': 'Username is required.'}), 400
    other = User.query.filter(User.username.ilike(username)).first()
    if not other:
        return jsonify({'error': 'User not found.'}), 404
    if other.id == current_user.id:
        return jsonify({'error': 'Cannot message yourself.'}), 400
    if not are_friends(current_user.id, other.id):
        return jsonify({'error': 'You can only message friends.'}), 403

    messages = Message.query.filter(
        ((Message.sender_id == current_user.id) & (Message.receiver_id == other.id)) |
        ((Message.sender_id == other.id) & (Message.receiver_id == current_user.id))
    ).order_by(Message.date_created.asc()).all()

    return jsonify({
        'messages': [{
            'id': m.id,
            'text': m.text or '',
            'image': (m.image_path if m.image_path.startswith('http') else url_for('static', filename=m.image_path)) if m.image_path else None,
            'from_me': m.sender_id == current_user.id,
            'sender': m.sender.username,
            'time': m.date_created.strftime('%I:%M %p') if m.date_created else ''
        } for m in messages],
        'other_user': {
            'username': other.username,
            'profile_pic': profile_pic_url(other)
        }
    })


@views.route("/api/messages/send", methods=['POST'])
@login_required
def send_message():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    text = (data.get('text') or '').strip()

    if not username or not text:
        return jsonify({'error': 'Username and message are required.'}), 400
    if len(text) > 500:
        return jsonify({'error': 'Message too long.'}), 400

    receiver = User.query.filter(User.username.ilike(username)).first()
    if not receiver:
        return jsonify({'error': 'User not found.'}), 404
    if receiver.id == current_user.id:
        return jsonify({'error': 'Cannot message yourself.'}), 400
    if not are_friends(current_user.id, receiver.id):
        return jsonify({'error': 'You can only message friends.'}), 403

    msg = Message(sender_id=current_user.id, receiver_id=receiver.id, text=text)
    db.session.add(msg)
    db.session.commit()

    return jsonify({
        'message': {
            'id': msg.id,
            'text': msg.text,
            'image': None,
            'from_me': True,
            'sender': current_user.username,
            'time': msg.date_created.strftime('%I:%M %p') if msg.date_created else ''
        }
    })


DM_ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'zip'}

def dm_allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in DM_ALLOWED_EXTENSIONS

IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

@views.route("/api/messages/send-file", methods=['POST'])
@login_required
def send_dm_file():
    username = (request.form.get('username') or '').strip()
    caption = (request.form.get('caption') or '').strip()[:500]

    if not username:
        return jsonify({'error': 'Username is required.'}), 400

    receiver = User.query.filter(User.username.ilike(username)).first()
    if not receiver:
        return jsonify({'error': 'User not found.'}), 404
    if receiver.id == current_user.id:
        return jsonify({'error': 'Cannot message yourself.'}), 400
    if not are_friends(current_user.id, receiver.id):
        return jsonify({'error': 'You can only message friends.'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded.'}), 400
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'No file selected.'}), 400
    if not dm_allowed_file(file.filename):
        return jsonify({'error': 'Unsupported file type.'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower()
    public_id = f"dm_{current_user.id}_{uuid.uuid4().hex[:10]}"
    try:
        file_bytes = file.read()
        result = _upload_file(file_bytes, folder='dm', public_id=public_id)
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

    # result is a full URL (Cloudinary) or relative path (local)
    msg_text = caption if caption else ('[file]' if ext not in IMAGE_EXTENSIONS else '')
    msg = Message(sender_id=current_user.id, receiver_id=receiver.id,
                  text=msg_text, image_path=result)
    db.session.add(msg)
    db.session.commit()

    img_url = result if result.startswith('http') else url_for('static', filename=result)
    return jsonify({
        'message': {
            'id': msg.id,
            'text': msg.text,
            'image': img_url,
            'from_me': True,
            'sender': current_user.username,
            'time': msg.date_created.strftime('%I:%M %p') if msg.date_created else ''
        }
    })


@views.route("/api/profile-picture", methods=['POST'])
@login_required
def upload_profile_picture():
    if 'photo' not in request.files:
        return jsonify({'error': 'No file uploaded.'}), 400

    file = request.files['photo']
    if not file or not file.filename:
        return jsonify({'error': 'No file selected.'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Use PNG, JPG, GIF, or WEBP.'}), 400

    # Delete old picture first
    if current_user.profile_pic:
        _delete_file(current_user.profile_pic)

    public_id = f"user_{current_user.id}_{uuid.uuid4().hex[:8]}"
    try:
        # Read into bytes so the stream is fresh for Cloudinary
        file_bytes = file.read()
        result = _upload_file(file_bytes, folder='profiles', public_id=public_id)
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

    current_user.profile_pic = result  # full URL (Cloudinary) or relative path (local)
    db.session.commit()

    # Return the URL to display
    pic_url = result if result.startswith('http') else url_for('static', filename=result)
    return jsonify({'profile_pic': pic_url})


@views.route("/api/profile-picture", methods=['DELETE'])
@login_required
def delete_profile_picture():
    if current_user.profile_pic:
        _delete_file(current_user.profile_pic)
        current_user.profile_pic = ''
        db.session.commit()
    return jsonify({'message': 'Profile picture removed.'})


@views.route("/projects")
@login_required
def projects():
    projects_list = [
        {
            "id": 1,
            "title": "Codescripts",
            "category": "branding",
            "image": "uploads/projects/codescripts.png",
            "desc": "The rebranding of an RX-TO-OTC switch platform; creating a new horizon, An energy of hope, optimism and warmth."
        },
        {
            "id": 2,
            "title": "Slosh Seltzers",
            "category": "platform",
            "image": "uploads/projects/slosh_seltzer.png",
            "desc": "Vibrant and refreshing design system for a sparkling energy seltzer brand."
        },
        {
            "id": 3,
            "title": "Mucus Masher",
            "category": "game",
            "image": "uploads/projects/mucus_masher.png",
            "desc": "An action-packed casual gaming adventure featuring a friendly gooey green slime monster."
        },
        {
            "id": 4,
            "title": "Vite Web App",
            "category": "web",
            "image": "uploads/projects/slosh_seltzer.png",
            "desc": "A cutting-edge, blazing fast web app dashboard designed for modular widgets."
        },
        {
            "id": 5,
            "title": "NeuralNet Core",
            "category": "ai",
            "image": "uploads/projects/codescripts.png",
            "desc": "An AI-powered agent orchestration backend and workflow builder with real-time feedback."
        }
    ]
    return render_template("projects.html", user=current_user, projects=projects_list)

