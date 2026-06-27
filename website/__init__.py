
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_mail import Mail
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, will use hardcoded defaults

db = SQLAlchemy()
DB_NAME = "project.db"

# Create the mail object here so auth.py can import it
mail = Mail()

def create_database(app):
    with app.app_context():
        from sqlalchemy import inspect, text

        db.create_all()

        # SQLite-only migrations (skipped on PostgreSQL — columns already defined in models)
        db_url = app.config.get("SQLALCHEMY_DATABASE_URI", "")
        if "sqlite" in db_url:
            inspector = inspect(db.engine)
            if 'user' in inspector.get_table_names():
                columns = {col['name'] for col in inspector.get_columns('user')}
                if 'bio' not in columns:
                    db.session.execute(text("ALTER TABLE user ADD COLUMN bio VARCHAR(500) DEFAULT ''"))
                    db.session.commit()
                if 'profile_pic' not in columns:
                    db.session.execute(text("ALTER TABLE user ADD COLUMN profile_pic VARCHAR(300) DEFAULT ''"))
                    db.session.commit()
            if 'message' in inspector.get_table_names():
                msg_columns = {col['name'] for col in inspector.get_columns('message')}
                if 'image_path' not in msg_columns:
                    db.session.execute(text("ALTER TABLE message ADD COLUMN image_path VARCHAR(300) DEFAULT ''"))
                    db.session.commit()


def create_app():
    app = Flask(__name__,
                static_folder=os.path.join(os.path.dirname(__file__), 'static'),
                template_folder=os.path.join(os.path.dirname(__file__), 'templates'))

    # Fix Neon/Heroku-style postgres:// → postgresql:// (SQLAlchemy 2.x requirement)
    raw_db_url = os.getenv("DATABASE_URL", f"sqlite:///{DB_NAME}")
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = raw_db_url
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

    # Mail Configuration
    app.config['MAIL_SERVER']   = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    app.config['MAIL_PORT']     = int(os.getenv('MAIL_PORT', 465))
    app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME', '')
    app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD', '').replace(' ', '')
    app.config['MAIL_USE_TLS']  = os.getenv('MAIL_USE_TLS', 'False').lower() == 'true'
    app.config['MAIL_USE_SSL']  = os.getenv('MAIL_USE_SSL', 'True').lower() == 'true'
    app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_USERNAME', '')

    # Bind extensions to the app
    db.init_app(app)
    mail.init_app(app)

    # Import models
    from . import models
    from .models import User, Post, Comment, Like, FriendRequest, Message

    # Create the database
    create_database(app)

    # Register blueprints
    from .views import views
    from .auth import auth
    from .admin import admin
    app.register_blueprint(views, url_prefix="/")
    app.register_blueprint(auth, url_prefix="/")
    app.register_blueprint(admin)

    # Initialize Login Manager
    login_manager = LoginManager()
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Please log in to continue."
    login_manager.login_message_category = "info"
    login_manager.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        from flask import redirect, url_for, request as req
        return redirect(url_for('auth.login', next=req.url))

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @app.context_processor
    def inject_globals():
        from flask_login import current_user
        from .models import User as UserModel
        if current_user.is_authenticated:
            from .models import FriendRequest
            accepted_reqs = FriendRequest.query.filter(
                ((FriendRequest.sender_id == current_user.id) | (FriendRequest.receiver_id == current_user.id)) &
                (FriendRequest.status == 'accepted')
            ).all()

            friend_ids = []
            for req in accepted_reqs:
                friend_ids.append(req.receiver_id if req.sender_id == current_user.id else req.sender_id)

            friends = UserModel.query.filter(UserModel.id.in_(friend_ids)).order_by(UserModel.username).all() if friend_ids else []

            all_reqs = FriendRequest.query.filter(
                (FriendRequest.sender_id == current_user.id) | (FriendRequest.receiver_id == current_user.id)
            ).all()

            exclude_ids = {current_user.id}
            for r in all_reqs:
                exclude_ids.add(r.sender_id)
                exclude_ids.add(r.receiver_id)

            suggestions = UserModel.query.filter(~UserModel.id.in_(exclude_ids)).order_by(UserModel.username).limit(4).all()

            return {
                'all_users': friends,
                'suggested_users': suggestions
            }
        return {}

    return app
