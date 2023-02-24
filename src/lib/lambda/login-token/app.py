# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import logging
import os
import json
import base64
import time
from selenium.webdriver.chrome.service import Service
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

log = logging.getLogger()
log.setLevel('INFO')
server_url = os.environ.get('SERVER_URL')
oidc_provider = os.environ.get('OIDC_PROVIDER')

LOGIN_CACHE = {}

def handler(event, context):
    log.info(f"server_url={server_url}")
    log.info(f"oidc_provider={oidc_provider}")

    req_json = get_req_data(event)

    username = req_json.get('username', None)
    password = req_json.get('password', None)
         
    if not username or not password:
        return auth_error("username or password is not set")
       
    log.info(f"username={username}")
    log.info(f"password={'*' * len(password)}")
    login_url = f"{server_url}"

    cache_key = base64.b64encode(f"{username}{password}{login_url}".encode('utf-8')).decode('ascii')
    curr_time = int(time.time())
    one_day_left = curr_time - 24 * 3600

    if cache_key in LOGIN_CACHE:
        login_response = LOGIN_CACHE[cache_key]
        if not login_response['error'] and login_response['expireAt'] < one_day_left:
            login_response = login_and_update_cache(login_url, username, password, cache_key)
        elif login_response['error'] and login_response['expireAt'] < curr_time:
            login_response = login_and_update_cache(login_url, username, password, cache_key)
        else:  
            log.info("Found token in cache")
    else:
        login_response = login_and_update_cache(login_url, username, password, cache_key)

    if login_response['error']:
        return auth_error(login_response)

    return auth_success(login_response)


def get_req_data(event):
    if 'body' in event:
        # from api gateway
        req_body = event['body']
        isBase64Encoded = event.get('isBase64Encoded', False)
        if not isBase64Encoded:
            req_json = json.loads(req_body)
        else:
            req_json = json.loads(base64.b64decode(req_body))
    else:
        # invoke lambda directly
        req_json = event
    return req_json


def auth_error(login_response):
    return  {
        "statusCode": 401,
        "headers": {
           "Content-Type": "application/json",
           "Access-Control-Allow-Origin": "*",
           "Access-Control-Allow-Credentials": "true",
           "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        },
        "body": json.dumps(login_response),
    }

def auth_success(login_response):
    return {
        "statusCode": 200,
        "headers": {
           "Content-Type": "application/json",
           "Access-Control-Allow-Origin": "*",
           "Access-Control-Allow-Credentials": "true",
           "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        },
        "body": json.dumps(login_response),
    }

def login_and_update_cache(login_url, username, password, cache_key):
    login_response = login(login_url, username, password)
    LOGIN_CACHE[cache_key] = login_response
    return login_response

def login(url, username, password):
    log.info(f"login: {url}, username: {username}")
    chrome_options = ChromeOptions()
    chrome_options.binary_location = "/opt/chrome/chrome"
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-dev-tools")
    chrome_options.add_argument("--no-zygote")
    chrome_options.add_argument("--single-process")

    log.info(chrome_options.arguments)

    service = Service(executable_path="/opt/chromedriver")
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.get(url)
    
    WebDriverWait(driver, 20).until(lambda driver: driver.execute_script('return document.readyState') == 'complete')
    if 'COGNITO' in oidc_provider:
       login_cognito(driver, username, password)
    elif oidc_provider == 'KEYCLOAK':
       login_keycloak(driver, username, password)
    else:
       raise NameError(f"unknown oidc_provider {oidc_provider}")

    cookies = driver.get_cookies()
    current_url = driver.current_url
    driver.quit()
    log.info(f"current_url: {current_url}")
    
    if current_url == url:
        log.info("Login successfully")
    else:
        log.info("Login failed")
        return {
            'expireAt': 60 + int(time.time()),
            'error': True,
            'message': 'Authentication Error'
        }

    cookies_values=[]
    for c in cookies:
        c_name = c['name']
        c_value = c['value']
        cookies_values.append(f"{c_name}={c_value}")
    
    createTime = int(time.time()) - 15
    cookies_header = "; ".join(cookies_values)
    body = {
        'cookie': cookies_header,
        'expireAt': 604800 + createTime, # 7days
        'error': False,
        'message': 'Authenticated successfully'
    }
    return body

def login_cognito(driver, username, password):
    e_index = 0
    username_input = driver.find_elements(by=By.NAME, value="username")[e_index]
    username_input.send_keys(username)
    password_input = driver.find_elements(by=By.NAME, value="password")[e_index]
    password_input.send_keys(password)
    submit_button = driver.find_elements(by=By.NAME, value="signInSubmitButton")[e_index]
    submit_button.click()

def login_keycloak(driver, username, password):
    e_index = 0
    username_input = driver.find_elements(by=By.NAME, value="username")[e_index]
    username_input.send_keys(username)
    password_input = driver.find_elements(by=By.NAME, value="password")[e_index]
    password_input.send_keys(password)
    submit_button = driver.find_elements(by=By.NAME, value="login")[e_index]
    submit_button.click()  