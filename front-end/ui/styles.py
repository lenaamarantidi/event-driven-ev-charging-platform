import streamlit as st

def load_css():
    st.markdown("""
    <style>
        /* Main Background */
        .stApp {
            background-color: #E0E0E0;
            color: black;
        }

        /* Header */
        .header-container {
            border-bottom: 1px solid #999;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .app-title {
            font-size: 26px;
            font-weight: 500;
            color: #333;
        }

        /* Info Card */
        .info-card {
            background-color: #F5F5F5;
            padding: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            color: #333;
        }

        /* Warning/Modal Box styling */
        .modal-box {
            background-color: #F0F0F0;
            padding: 20px;
            border: 1px solid #CCC;
            text-align: center;
            margin-bottom: 20px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        
        /* Navigation Error Box */
        .nav-error-box {
            background-color: #F0F0F0;
            padding: 25px;
            border: 1px solid #ddd;
            text-align: center;
            margin-bottom: 10px;
            color: #333;
            font-size: 14px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        /* General Error Box */
        .error-box {
            background-color: #F5F5F5;
            padding: 30px;
            text-align: center;
            margin-top: 50px;
            border: 1px solid #ddd;
        }

        /* Buttons */
        div.stButton > button {
            border-radius: 4px;
            background-color: #DDD;
            color: black;
            border: none;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        div.stButton > button:hover {
            background-color: #CCC;
            color: black;
        }
    </style>
    """, unsafe_allow_html=True)