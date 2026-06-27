from flask import Blueprint, render_template, redirect, url_for, request, flash, session, jsonify
from . import db, mail
from .models import User
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_mail import Message
import random
import time

auth = Blueprint("auth", __name__)

@auth.route("/login", methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        # Changed from GA to username
        username = request.form.get("username") 
        password = request.form.get("password")

        # Query database by username instead of GA
        user = User.query.filter_by(username=username).first()
        
        if user:
            if check_password_hash(user.password, password):
                flash("Logged in successfully!", category='success')
                login_user(user, remember=True)
                return redirect(url_for('views.home'))
            else:
                flash('Incorrect password. Please try again.', category='error')
        else:
            flash('Username not found. Please check your details.', category='error')

    return render_template("login.html", user=current_user)

@auth.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.get_json()
    email = data.get('email')
    
    if not email:
        return jsonify({'error': 'Email is required'}), 400

    # Generate a random 4-digit OTP
    otp = str(random.randint(1000, 9999))
    
    # Store the OTP, email, and timestamp in the current session
    session['otp'] = otp
    session['otp_email'] = email
    session['otp_created_at'] = time.time()

    # Create and send the email
    msg = Message('Your This is WAter. Verification Code', 
                  sender='abiram.yeager18@gmail.com', # Updated to your sender email
                  recipients=[email])
    msg.body = f'Welcome to This is WAter.! Your OTP for sign up is: {otp}'

    try:
        mail.send(msg)
        return jsonify({'message': 'OTP sent successfully'}), 200
    except Exception as e:
        print(f"Mail error: {e}")
        return jsonify({'error': 'Failed to send email'}), 500

@auth.route("/register", methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get("email")
        username = request.form.get("username")
        password1 = request.form.get("password1")
        password2 = request.form.get("password2")
        user_otp = request.form.get("otp")

        # Strip accidental whitespace from the user's input
        if user_otp:
            user_otp = user_otp.strip()

        # Fetch the real OTP and email from the session
        stored_otp = session.get('otp')
        stored_email = session.get('otp_email')
        otp_created_at = session.get('otp_created_at', 0)
        otp_expired = (time.time() - otp_created_at) > 600  # 10-minute window

        # Validation checks
        email_exists = User.query.filter_by(email=email).first()
        username_exists = User.query.filter_by(username=username).first()

        if not stored_otp or user_otp != stored_otp or otp_expired:
            flash('Invalid or expired OTP. Please request a new one.', category='error')
        elif email != stored_email:
            flash('Email does not match the one verified.', category='error')
        elif email_exists:
            flash('This email is already registered.', category='error')
        elif username_exists:
            flash('This username is already taken.', category='error')
        elif password1 != password2:
            flash('Passwords do not match.', category='error')
        elif len(username) < 2:
            flash('Username is too short.', category='error')
        elif len(password1) < 6:
            flash('Password is too short.', category='error')
        elif len(email) < 4:
            flash('Invalid email address.', category='error')
        else:
            # Create new user without GA
            new_user = User(
                email=email,
                username=username,
                password=generate_password_hash(password1, method='pbkdf2:sha256')
            )
            db.session.add(new_user)
            db.session.commit()
            
            # Clear the OTP from session to prevent reuse
            session.pop('otp', None)
            session.pop('otp_email', None)
            session.pop('otp_created_at', None)

            login_user(new_user, remember=True)
            flash('Account created successfully! Welcome!', category='success')
            return redirect(url_for('views.home'))

    return render_template("signup.html", user=current_user)

@auth.route("/logout")
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', category='success')
    return redirect(url_for("views.home"))