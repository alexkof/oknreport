import os.path

from ssl import SSLEOFError
import traceback
from time import sleep
import telebot
from telebot import types
import numpy as np
import pandas as pd
from urllib.parse import urlparse, parse_qs, quote_plus
from urllib.error import URLError
from datetime import datetime, timedelta
from requests.exceptions import ReadTimeout

from google.oauth2 import service_account
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google_auth_oauthlib.flow import InstalledAppFlow
from io import BytesIO
from dotenv import dotenv_values

from PIL import Image
import pillow_heif

# Register HEIF opener with Pillow
pillow_heif.register_heif_opener()

config = dotenv_values(".env")
current_day = datetime.now() - timedelta(days=1)

doc_id = config['DOC_ID']
SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
]

def get_url(page_id):
    return f"https://docs.google.com/spreadsheets/d/{doc_id}/export?gid={page_id}&format=csv"

def get_column_mappings(sheet_id):
    return pd.read_csv(get_url(sheet_id))

admin_chat_id = config['ADMIN_CHAT_ID']
main_chat_id = config['MAIN_CHAT_ID']

column_mappings_sheet_id = 2098432719
answer_sheet_id = 1194509703
main_sheet_id = 1530376561

chat_id = '@monitoringokn'
bot = telebot.TeleBot(config['BOT_TOKEN'])
COLUMN_MAPPINGS = get_column_mappings(column_mappings_sheet_id)

def get_main_table():
    return pd.read_csv(get_url(main_sheet_id))

MAIN_TABLE = get_main_table()

def create_service():
    creds = service_account.Credentials.from_service_account_file("monitoringokn-bba1ad0ed8e5.json", scopes=SCOPES)
    return build('drive', 'v3', credentials=creds), build('sheets', 'v4', credentials=creds)

drive_service, sheet_service = create_service()

def download_file(service, file_id, file_name):
    request = service.files().get_media(fileId=file_id)
    fh = BytesIO()
    downloader = MediaIoBaseDownload(fd=fh, request=request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
        print("Download Progress: {0}".format(int(status.progress() * 100)))
    fh.seek(0)
    with open(file_name, 'wb') as f:
        f.write(fh.read())
        f.close()

def has_short_name(column):
    return column in COLUMN_MAPPINGS['key'].values

def get_short_name(column):
    return COLUMN_MAPPINGS.loc[COLUMN_MAPPINGS['key'] == column]['value']

def get_photo_id(url):
    parsed_url = urlparse(url)
    query_string = parsed_url.query
    query_params = parse_qs(query_string)    
    return query_params.get("id")[0]

def compress_image(image_path, max_dimension=4000):
    """
    Compress image so that the largest dimension is <= max_dimension pixels.
    Converts HEIC to JPEG format for compatibility.
    Returns the path to the compressed image.
    """
    try:
        with Image.open(image_path) as img:
            # Convert HEIC to RGB if needed (HEIC images are often in different color spaces)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            
            # Get current dimensions
            width, height = img.size
            
            # Check if compression is needed
            if width <= max_dimension and height <= max_dimension:
                # Even if no resizing needed, convert HEIC to JPEG for compatibility
                if image_path.lower().endswith('.heic') or img.format == 'HEIF':
                    base_name, _ = os.path.splitext(image_path)
                    converted_path = f"{base_name}_converted.jpg"
                    img.save(converted_path, 'JPEG', quality=95, optimize=True)
                    print(f"Converted HEIC {image_path} to JPEG {converted_path}")
                    return converted_path
                return image_path  # No compression needed
            
            # Calculate new dimensions maintaining aspect ratio
            if width > height:
                new_width = max_dimension
                new_height = int(height * (max_dimension / width))
            else:
                new_height = max_dimension
                new_width = int(width * (max_dimension / height))
            
            # Resize image
            compressed_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Create compressed filename - always use JPEG for better compatibility
            base_name, _ = os.path.splitext(image_path)
            compressed_path = f"{base_name}_compressed.jpg"
            
            # Save compressed image as JPEG
            compressed_img.save(compressed_path, 'JPEG', quality=95, optimize=True)
            
            print(f"Compressed {image_path} from {width}x{height} to {new_width}x{new_height} as JPEG")
            return compressed_path
            
    except Exception as e:
        print(f"Failed to compress {image_path}: {str(e)}")
        # If compression fails, try to at least convert HEIC to JPEG
        try:
            if image_path.lower().endswith('.heic'):
                with Image.open(image_path) as img:
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGB')
                    base_name, _ = os.path.splitext(image_path)
                    converted_path = f"{base_name}_converted.jpg"
                    img.save(converted_path, 'JPEG', quality=95, optimize=True)
                    print(f"Converted HEIC {image_path} to JPEG {converted_path} after compression failed")
                    return converted_path
        except Exception as convert_error:
            print(f"Failed to convert HEIC {image_path}: {str(convert_error)}")
        
        return image_path  # Return original if everything fails

def handle_upload_error(error, true_index, sheet_service, doc_id):
    """
    Handle upload errors by logging to spreadsheet and continuing to next post.
    """
    error_str = str(error)
    print(error_str)
    body = {
        'values': [[error_str]]
    }
            
    result = sheet_service.spreadsheets().values().update(
        spreadsheetId=doc_id, range=f'Ответы!D{true_index}', valueInputOption="USER_ENTERED", body=body).execute()
    sleep(300)

def form_message(post, columns):
    init_str = ""
    if 'Фото' not in post:
        return 0, 0, 0, 0
    _photos = post['Фото']
    photos = _photos.split(",")
    __photos = []
    main_row = MAIN_TABLE[MAIN_TABLE['Номер'] == int(post['Номер'])]
    _name = "<b>" + main_row['Название'].values[0] + "</b>\n"
    address = main_row['Адрес'].values[0]
    address_url = quote_plus(address)
    _address = f'<a href="https://yandex.ru/maps/54/yekaterinburg?text=Свердловская область, {address_url}">{address}</a>\n\n'
    init_str += _name
    init_str += _address
    for photo in photos:
        _id = get_photo_id(photo.strip())
        name = _id
        download_file(drive_service, _id, name)
        __photos.append(name)
        
    for column in columns:
        if has_short_name(column):
            kk = get_short_name(column)
            if column in post and kk.values[0] is not np.nan:
                column_name = kk.values[0]
                column_value = post[column]
                if column_name == "Номер:":
                    column_value = f'<a href="https://ru-monuments.toolforge.org/get_info.php?id={column_value}">{column_value}</a>'
                if column_name == "Существует:":
                    if column_value == "Да  (в том числе, руины, остатки фундаментов)":
                        column_value = "Да"
                    
                init_str += f"<b>{column_name}</b> {column_value}\n"

    return __photos, init_str, main_row['Номер'].values[0], address

def get_number_id(number):
    return all_posts[all_posts['Номер'] == number].index[0] + 2
    
def print_new_posts(new_rows):
    columns = COLUMN_MAPPINGS['key'].values
    for index, post in new_rows.iterrows():
        true_index = index + 2
        if pd.notna(post['Пост в канале']):
            continue
        
        _imgs, text, number, address = form_message(post.dropna(), columns)
        if _imgs == 0:
            continue
        
        # Compress all images and create media group
        compressed_images = []
        for _img in _imgs:
            compressed_path = compress_image(_img)
            compressed_images.append(compressed_path)
        
        # Create media group with compressed images
        imgs = []
        for compressed_img in compressed_images:
            imgs.append(types.InputMediaPhoto(open(compressed_img, 'rb')))
            
        try:
            resp_photos = bot.send_media_group(chat_id, imgs, timeout=100)
            print(f"Successfully sent media group with {len(imgs)} compressed images")
            
        except Exception as e:
            handle_upload_error(e, true_index, sheet_service, doc_id)
            continue
            
        m_id = resp_photos[0].message_id
        text += f'<a href="https://t.me/monitoringokn/{m_id}">Фото</a>\n'
        resp = bot.send_message(chat_id, text, parse_mode='HTML', disable_web_page_preview=True)
        link = f"https://t.me/monitoringokn/{resp.message_id}"
        body = {
            'values': [[link]]
        }
        result = sheet_service.spreadsheets().values().update(
            spreadsheetId=doc_id, range=f'Ответы!D{true_index}', valueInputOption="USER_ENTERED", body=body).execute()
        
        # Clean up downloaded image files (both original and compressed)
        for _img in _imgs:
            try:
                if os.path.exists(_img):
                    os.remove(_img)
                    print(f"Cleaned up {_img}")
            except Exception as e:
                print(f"Failed to clean up {_img}: {str(e)}")
        
        # Clean up compressed images
        for compressed_img in compressed_images:
            try:
                if os.path.exists(compressed_img) and compressed_img != _img:
                    os.remove(compressed_img)
                    print(f"Cleaned up compressed image {compressed_img}")
            except Exception as e:
                print(f"Failed to clean up compressed image {compressed_img}: {str(e)}")
                
        sleep(300)

        
def maim():
    print_new_posts(all_posts)


def daily_job():
    def form_message(all_posts, all_completed_posts):
        all_posts_len = len(all_posts)
        completed_posts_len = len(all_completed_posts)
        perc_completed = int(completed_posts_len / all_posts_len * 100)

        all_completed_posts['Timestamp'] = pd.to_datetime(all_completed_posts['Timestamp'])
        yesterday = datetime.now().date() - timedelta(days=1)
        yesterday_df = all_completed_posts[all_completed_posts['Timestamp'].dt.date == yesterday]    
        
        much = len(yesterday_df)
        
        # Don't show daily progress if there are 0 new objects
        if much == 0:
            return None
            
        message = f'''
Доброе утро

Вчера было отмониторено <b>{much} объектов</b>:\n'''
        for index, post in yesterday_df.iterrows():
            message += f"{index}) <a href='{post['Пост в канале']}'>{post['Название']}</a>\n"
        message += f'''
Спасибо нашим волонтерам!

<b>Всего мы собрали данные по {completed_posts_len} объектам из {all_posts_len}.  Это {perc_completed}% от общего числа.</b>
'''
        return message
    
    all_posts = get_main_table()
    all_completed_posts = pd.read_csv(get_url(answer_sheet_id))
    message = form_message(all_posts, all_completed_posts)
    
    # Only send message if there are new objects to report
    if message is not None:
        bot.send_message(main_chat_id, message, parse_mode='HTML', disable_web_page_preview=True)
    

# Handler for /id command
@bot.message_handler(commands=['id'])
def handle_id_command(message):
    chat_id = message.chat.id
    bot.reply_to(message, f"Chat ID: {chat_id}")


if __name__ == "__main__":
    try:
        # Start bot polling in background for immediate command handling
        import threading
        bot_thread = threading.Thread(target=bot.infinity_polling, daemon=True)
        bot_thread.start()
        
        while True:
            try:
                that_day = datetime.now()
                if that_day.month > current_day.month or that_day.day > current_day.day and that_day.hour == 9-5:
                    print("Starting do daily job...")
                    current_day = that_day
                    daily_job()
                    print("... finishing daily job.")

                print("Starting process")
                all_posts = pd.read_csv(get_url(answer_sheet_id))
                maim()
                
                sleep(150)
                
            # except (URLError, TimeoutError, SSLEOFError, ReadTimeout):
            except Exception as e:
                print(traceback.format_exc())
                # print("See URLError, TimeoutError")                
                bot.send_message(admin_chat_id, "URLError, TimeoutError, SSLEOFError")
                sleep(1000)
    except Exception as e:
        print(traceback.format_exc())
        resp = bot.send_message(admin_chat_id, str(traceback.format_exc()))
            
