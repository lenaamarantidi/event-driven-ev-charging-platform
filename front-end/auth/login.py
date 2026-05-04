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
                new_pass = st.text_input("Choose Password", type="password", key="signup_pass")
                signup_button = st.form_submit_button("Create Account", use_container_width=True)
                
                if signup_button:
                    if new_user and new_pass:
                        res, err = signup_user(new_user, new_pass)
                        if res:
                            if res.status_code == 201:
                                st.success("Account created! Please switch to Login tab.")
                            elif res.status_code == 409:
                                st.warning("Username already exists.")
                            else:
                                st.error("Registration failed.")
                        else:
                            st.error(f"Server connection error: {err}. Please try again later.")
                    else:
                        st.warning("Please fill in all fields.")