from flask import (
    Blueprint, render_template, request, redirect,
    url_for, session, flash, jsonify, current_app
)
from functools import wraps
from .models import User, Post, Comment, Like, FriendRequest, Message
from . import db
from werkzeug.security import generate_password_hash
import os

admin = Blueprint("admin", __name__, url_prefix="/admin")

# ── Auth guard ────────────────────────────────────────────────────────────────

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin.login'))
        return f(*args, **kwargs)
    return decorated


# ── Login / Logout ────────────────────────────────────────────────────────────

@admin.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('admin_logged_in'):
        return redirect(url_for('admin.dashboard'))

    error = None
    if request.method == 'POST':
        uname = request.form.get('username', '').strip()
        pwd   = request.form.get('password', '').strip()

        ADMIN_U = os.getenv('ADMIN_USERNAME', 'admin')
        ADMIN_P = os.getenv('ADMIN_PASSWORD', 'changeme')

        if uname == ADMIN_U and pwd == ADMIN_P:
            session['admin_logged_in'] = True
            session.permanent = False
            return redirect(url_for('admin.dashboard'))
        else:
            error = 'Invalid credentials.'

    return render_template('admin/login.html', error=error)


@admin.route('/logout')
def logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin.login'))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@admin.route('/')
@admin_required
def dashboard():
    stats = {
        'users':           User.query.count(),
        'posts':           Post.query.count(),
        'comments':        Comment.query.count(),
        'likes':           Like.query.count(),
        'messages':        Message.query.count(),
        'friend_requests': FriendRequest.query.count(),
        'pending_fr':      FriendRequest.query.filter_by(status='pending').count(),
        'accepted_fr':     FriendRequest.query.filter_by(status='accepted').count(),
    }
    # 5 most recent users
    recent_users = User.query.order_by(User.date_created.desc()).limit(5).all()
    # 5 most recent posts
    recent_posts = Post.query.order_by(Post.date_created.desc()).limit(5).all()
    return render_template('admin/dashboard.html', stats=stats,
                           recent_users=recent_users, recent_posts=recent_posts)


# ── Users ─────────────────────────────────────────────────────────────────────

@admin.route('/users')
@admin_required
def users():
    q     = request.args.get('q', '').strip()
    page  = request.args.get('page', 1, type=int)
    query = User.query
    if q:
        query = query.filter(
            User.username.ilike(f'%{q}%') | User.email.ilike(f'%{q}%')
        )
    pagination = query.order_by(User.date_created.desc()).paginate(page=page, per_page=20, error_out=False)
    return render_template('admin/users.html', pagination=pagination, q=q)


@admin.route('/users/<int:uid>')
@admin_required
def user_detail(uid):
    user = User.query.get_or_404(uid)

    posts    = Post.query.filter_by(author=uid).order_by(Post.date_created.desc()).all()
    comments = Comment.query.filter_by(author=uid).order_by(Comment.date_created.desc()).all()
    likes    = Like.query.filter_by(author=uid).all()

    sent_reqs = FriendRequest.query.filter_by(sender_id=uid).all()
    recv_reqs = FriendRequest.query.filter_by(receiver_id=uid).all()

    sent_msgs = Message.query.filter_by(sender_id=uid).order_by(Message.date_created.desc()).all()
    recv_msgs = Message.query.filter_by(receiver_id=uid).order_by(Message.date_created.desc()).all()

    friends = []
    for fr in FriendRequest.query.filter(
        ((FriendRequest.sender_id == uid) | (FriendRequest.receiver_id == uid)),
        FriendRequest.status == 'accepted'
    ).all():
        fid = fr.receiver_id if fr.sender_id == uid else fr.sender_id
        fu  = User.query.get(fid)
        if fu:
            friends.append(fu)

    return render_template('admin/user_detail.html',
                           u=user, posts=posts, comments=comments,
                           likes=likes, sent_reqs=sent_reqs, recv_reqs=recv_reqs,
                           sent_msgs=sent_msgs, recv_msgs=recv_msgs, friends=friends)


@admin.route('/users/<int:uid>/edit', methods=['POST'])
@admin_required
def user_edit(uid):
    user = User.query.get_or_404(uid)
    user.username = request.form.get('username', user.username).strip()
    user.email    = request.form.get('email',    user.email).strip()
    user.bio      = request.form.get('bio',      user.bio or '').strip()[:500]
    new_pw = request.form.get('new_password', '').strip()
    if new_pw:
        user.password = generate_password_hash(new_pw, method='pbkdf2:sha256')
    db.session.commit()
    flash(f'User {user.username} updated.', 'success')
    return redirect(url_for('admin.user_detail', uid=uid))


@admin.route('/users/<int:uid>/delete', methods=['POST'])
@admin_required
def user_delete(uid):
    user = User.query.get_or_404(uid)
    uname = user.username
    db.session.delete(user)
    db.session.commit()
    flash(f'User "{uname}" and all their data deleted.', 'success')
    return redirect(url_for('admin.users'))


# ── Posts ─────────────────────────────────────────────────────────────────────

@admin.route('/posts')
@admin_required
def posts():
    q    = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    query = Post.query
    if q:
        query = query.filter(Post.text.ilike(f'%{q}%'))
    pagination = query.order_by(Post.date_created.desc()).paginate(page=page, per_page=20, error_out=False)
    return render_template('admin/posts.html', pagination=pagination, q=q)


@admin.route('/posts/<int:pid>/delete', methods=['POST'])
@admin_required
def post_delete(pid):
    post = Post.query.get_or_404(pid)
    db.session.delete(post)
    db.session.commit()
    flash('Post deleted.', 'success')
    return redirect(request.referrer or url_for('admin.posts'))


# ── Comments ──────────────────────────────────────────────────────────────────

@admin.route('/comments')
@admin_required
def comments():
    q    = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    query = Comment.query
    if q:
        query = query.filter(Comment.text.ilike(f'%{q}%'))
    pagination = query.order_by(Comment.date_created.desc()).paginate(page=page, per_page=30, error_out=False)
    return render_template('admin/comments.html', pagination=pagination, q=q)


@admin.route('/comments/<int:cid>/delete', methods=['POST'])
@admin_required
def comment_delete(cid):
    comment = Comment.query.get_or_404(cid)
    db.session.delete(comment)
    db.session.commit()
    flash('Comment deleted.', 'success')
    return redirect(request.referrer or url_for('admin.comments'))


# ── Messages ──────────────────────────────────────────────────────────────────

@admin.route('/messages')
@admin_required
def messages():
    q    = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    query = Message.query
    if q:
        query = query.join(User, Message.sender_id == User.id).filter(
            User.username.ilike(f'%{q}%') | Message.text.ilike(f'%{q}%')
        )
    pagination = query.order_by(Message.date_created.desc()).paginate(page=page, per_page=30, error_out=False)
    return render_template('admin/messages.html', pagination=pagination, q=q)


@admin.route('/messages/<int:mid>/delete', methods=['POST'])
@admin_required
def message_delete(mid):
    msg = Message.query.get_or_404(mid)
    db.session.delete(msg)
    db.session.commit()
    flash('Message deleted.', 'success')
    return redirect(request.referrer or url_for('admin.messages'))


# ── Friend Requests ───────────────────────────────────────────────────────────

@admin.route('/friend-requests')
@admin_required
def friend_requests():
    status = request.args.get('status', '')
    page   = request.args.get('page', 1, type=int)
    query  = FriendRequest.query
    if status in ('pending', 'accepted', 'declined'):
        query = query.filter_by(status=status)
    pagination = query.order_by(FriendRequest.date_created.desc()).paginate(page=page, per_page=30, error_out=False)
    return render_template('admin/friend_requests.html', pagination=pagination, status=status)


@admin.route('/friend-requests/<int:fid>/delete', methods=['POST'])
@admin_required
def friend_request_delete(fid):
    fr = FriendRequest.query.get_or_404(fid)
    db.session.delete(fr)
    db.session.commit()
    flash('Friend request deleted.', 'success')
    return redirect(request.referrer or url_for('admin.friend_requests'))


# ── Likes ─────────────────────────────────────────────────────────────────────

@admin.route('/likes')
@admin_required
def likes():
    page = request.args.get('page', 1, type=int)
    pagination = Like.query.order_by(Like.date_created.desc()).paginate(page=page, per_page=40, error_out=False)
    return render_template('admin/likes.html', pagination=pagination)


@admin.route('/likes/<int:lid>/delete', methods=['POST'])
@admin_required
def like_delete(lid):
    like = Like.query.get_or_404(lid)
    db.session.delete(like)
    db.session.commit()
    flash('Like removed.', 'success')
    return redirect(request.referrer or url_for('admin.likes'))


# ── Conversation viewer ───────────────────────────────────────────────────────

@admin.route('/conversation/<int:uid1>/<int:uid2>')
@admin_required
def conversation(uid1, uid2):
    u1 = User.query.get_or_404(uid1)
    u2 = User.query.get_or_404(uid2)
    msgs = Message.query.filter(
        ((Message.sender_id == uid1) & (Message.receiver_id == uid2)) |
        ((Message.sender_id == uid2) & (Message.receiver_id == uid1))
    ).order_by(Message.date_created.asc()).all()
    return render_template('admin/conversation.html', u1=u1, u2=u2, msgs=msgs)
