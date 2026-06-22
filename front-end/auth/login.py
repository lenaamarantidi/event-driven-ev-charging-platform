import streamlit as st
import time
from utils.api import login_user, signup_user

def login_page():
    c1, c2, c3 = st.columns([1, 2, 1])
    with c2:
        st.title("⚡ Chargerio Access")
        
        # Καρτέλες για Login και Sign Up
        tab_login, tab_signup = st.tabs(["🔑 Login", "📝 Sign Up"])
        
        # Login Tab
        with tab_login:
            st.markdown("Please sign in to access the EV Map.")
            with st.form("login_form"):
                username = st.text_input("Username", key="login_user")
                password = st.text_input("Password", type="password", key="login_pass")
                submit_button = st.form_submit_button("Sign In", use_container_width=True)

                if submit_button:
                    res, err = login_user(username, password)
                    if res:    
                        if res.status_code == 200:
                            data = res.json()
                            st.session_state['token'] = data['token']
                            st.session_state['authentication_status'] = True
                            st.success(f"Welcome back, {username}!")
                            time.sleep(0.5)
                            st.rerun()
                        else:
                            st.error("Invalid username or password")
                    else:
                        # login_user returned NONE
                        st.error(f"Server connection error: {err}. Please try again later.")
        # Sign Up Tab
        with tab_signup:
            st.markdown("Create a new account.")
            with st.form("signup_form"):
                new_user = st.text_input("Choose Username", key="signup_user")
                new_email = st.text_input("Email", key="signup_email")
                new_pass = st.text_input("Choose Password", type="password", key="signup_pass")
                confirm_pass = st.text_input("Confirm Password", type="password", key="signup_confirm")
                signup_button = st.form_submit_button("Create Account", use_container_width=True)

                if signup_button:
                    if not new_user or not new_email or not new_pass or not confirm_pass:
                        st.warning("Please fill in all fields.")
                    elif new_pass != confirm_pass:
                        st.warning("Passwords do not match.")
                    else:
                        res, err = signup_user(new_user, new_email, new_pass)
                        if res:
                            if res.status_code == 201:
                                st.success("Account created! Please switch to Login tab.")
                            elif res.status_code == 409:
                                try:
                                    data = res.json()
                                    error_msg = data.get('error', '')
                                    if 'email' in error_msg.lower():
                                        st.warning("This email is already registered, please use another one.")
                                    elif 'username' in error_msg.lower():
                                        st.warning("This username is taken, please choose another one.")
                                    else:
                                        st.warning(error_msg)
                                except Exception:
                                    st.warning("This account already exists.")
                            elif res.status_code == 400:
                                try:
                                    data = res.json()
                                    st.error(data.get('error', 'Registration failed.'))
                                except Exception:
                                    st.error("Registration failed. Check your input and try again.")
                            else:
                                st.error("Registration failed.")
                        else:
                            st.error(f"Server connection error: {err}. Please try again later.")