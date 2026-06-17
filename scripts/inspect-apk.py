#!/usr/bin/env python3
"""Inspect the TeamGeneration APK to find:
- API endpoints called
- AES key
- Auth bypass / token handling logic
- Hardcoded strings, URLs, secrets
"""
import sys
import re
from androguard.core.apk import APK

APK_PATH = "/home/z/my-project/upload/5_6251365405164574747 (1).apk"

def main():
    a = APK(APK_PATH)
    print("=== APK Info ===")
    print(f"Package: {a.get_package()}")
    print(f"App name: {a.get_app_name()}")
    print(f"Version: {a.get_androidversion_name()}")
    print(f"Permissions: {a.get_permissions()}")
    print(f"Activities: {a.get_activities()}")
    print(f"Main activity: {a.get_main_activity()}")
    print(f"Min SDK: {a.get_min_sdk_version()}")
    print(f"Target SDK: {a.get_target_sdk_version()}")
    
    print("\n=== Manifest (raw XML) ===")
    try:
        manifest = a.get_android_manifest_xml()
        print(manifest.toprettyxml()[:5000])
    except Exception as e:
        print(f"Could not get manifest XML: {e}")
    
    print("\n=== Strings from classes.dex ===")
    try:
        dex_data = a.get_dex()
        # Find all string-like patterns
        text = dex_data.decode('utf-8', errors='ignore')
        
        # Find URLs
        urls = set(re.findall(r'https?://[^\s"\'<>\\]+', text))
        print(f"\nURLs found ({len(urls)}):")
        for url in sorted(urls):
            print(f"  {url}")
        
        # Find /api/ paths
        api_paths = set(re.findall(r'/api/[a-zA-Z0-9/_-]+', text))
        print(f"\nAPI paths found ({len(api_paths)}):")
        for path in sorted(api_paths):
            print(f"  {path}")
        
        # Find anything that looks like a key
        keys = set(re.findall(r'[a-zA-Z0-9_]{20,}', text))
        # Filter out things that are clearly not keys
        interesting_keys = [k for k in keys if any(x in k.lower() for x in ['key', 'secret', 'token', 'bobby', 'believer', 'coder', 'tg_', 'software'])]
        print(f"\nInteresting keys/strings ({len(interesting_keys)}):")
        for k in sorted(interesting_keys)[:30]:
            print(f"  {k}")
        
        # Find fantasy/cricket/team keywords
        keywords = set(re.findall(r'[a-zA-Z_]{6,}', text))
        interesting_keywords = [k for k in keywords if any(x in k.lower() for x in ['fantasy', 'cricket', 'team', 'transfer', 'dream11', 'my11', 'player', 'captain', 'auth', 'verify', 'login'])]
        print(f"\nFantasy-related keywords ({len(interesting_keywords)}):")
        for k in sorted(interesting_keywords)[:30]:
            print(f"  {k}")
            
    except Exception as e:
        print(f"Could not analyze DEX: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
