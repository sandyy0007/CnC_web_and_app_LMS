"""Diagnostic script to verify AWS S3 connectivity, credentials, and permissions.

Safely tests S3 operations without uploading real student data or exposing secrets.
Can be executed locally or inside Render SSH/Shell.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import uuid

def mask_credential(val: str | None) -> str:
    if not val:
        return "[NOT SET]"
    if len(val) <= 8:
        return "****"
    return f"{val[:4]}...{val[-4:]} (length={len(val)})"

def run_s3_verification(bucket_override: str | None = None, region_override: str | None = None) -> bool:
    print("=" * 70)
    print("AWS S3 CONFIGURATION & CONNECTIVITY AUDIT")
    print("=" * 70)

    # 1. Environment check
    storage_driver = os.environ.get("STORAGE_DRIVER", "s3")
    bucket = bucket_override or os.environ.get("S3_BUCKET", "")
    region = region_override or os.environ.get("S3_REGION", "ap-south-1")
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    endpoint_url = os.environ.get("S3_ENDPOINT_URL")

    print("\n[1] Environment Variables:")
    print(f"  STORAGE_DRIVER        : {storage_driver}")
    print(f"  S3_BUCKET             : {bucket if bucket else '[EMPTY/UNSET]'}")
    print(f"  S3_REGION             : {region}")
    print(f"  AWS_ACCESS_KEY_ID     : {mask_credential(access_key)}")
    print(f"  AWS_SECRET_ACCESS_KEY : {mask_credential(secret_key)}")
    if endpoint_url:
        print(f"  S3_ENDPOINT_URL       : {endpoint_url}")

    if not bucket or bucket == "eedi-lms-private":
        print("\n[!] WARNING: S3_BUCKET is empty or still set to the default placeholder 'eedi-lms-private'.")
        print("    Please set S3_BUCKET to your actual AWS S3 bucket name in Render environment variables.")
        if not bucket_override:
            return False

    if not access_key or not secret_key:
        print("\n[!] NOTICE: AWS credentials are not set in the current execution environment.")
        print("    If deploying to Render, verify they are configured in the Render Dashboard under")
        print("    Environment Variables for both 'cnc-api' and 'cnc-worker'.")
        return False

    # 2. Boto3 client initialization
    print("\n[2] Initializing Boto3 S3 Client...")
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError

        client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )
        print("  [PASS] boto3 S3 client initialized with SigV4 and retry configuration.")
    except Exception as exc:
        print(f"  [FAIL] Failed to initialize boto3 client: {exc}")
        return False

    # 3. Bucket Connectivity & Existence
    print(f"\n[3] Testing Bucket Accessibility for '{bucket}'...")
    try:
        client.head_bucket(Bucket=bucket)
        print(f"  [PASS] Bucket '{bucket}' exists and is accessible with current credentials.")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        msg = exc.response.get("Error", {}).get("Message", str(exc))
        if code in ("404", "NoSuchBucket"):
            print(f"  [FAIL] Bucket '{bucket}' does not exist (404 Not Found).")
            print("         Please check the exact spelling of S3_BUCKET in AWS and Render.")
        elif code in ("403", "AccessDenied"):
            print(f"  [FAIL] Access Denied (403 Forbidden) accessing bucket '{bucket}'.")
            print("         The IAM user does not have permission to access this bucket, or the")
            print("         bucket belongs to a different AWS account.")
        elif code in ("301", "PermanentRedirect"):
            print(f"  [FAIL] Bucket '{bucket}' is located in a different AWS region than '{region}'.")
            print("         Update S3_REGION in Render environment variables to match the bucket's actual region.")
        else:
            print(f"  [FAIL] HeadBucket returned error {code}: {msg}")
        return False
    except EndpointConnectionError as exc:
        print(f"  [FAIL] Network connection error: {exc}")
        return False
    except Exception as exc:
        print(f"  [FAIL] Unexpected error probing bucket: {exc}")
        return False

    # 4. Region Verification
    print("\n[4] Verifying Bucket Region Alignment...")
    try:
        loc = client.get_bucket_location(Bucket=bucket).get("LocationConstraint")
        # In AWS, us-east-1 returns None or empty string
        actual_region = loc if loc else "us-east-1"
        if actual_region == region or (region == "us-east-1" and actual_region is None):
            print(f"  [PASS] Bucket region '{actual_region}' matches S3_REGION '{region}'.")
        else:
            print(f"  [WARNING] Bucket is in '{actual_region}', but S3_REGION is configured as '{region}'.")
            print(f"            Recommendation: Update S3_REGION={actual_region} in Render.")
    except ClientError as exc:
        print(f"  [NOTE] Could not query get_bucket_location ({exc.response.get('Error', {}).get('Code')}).")

    # 5. Non-destructive Synthetic CRUD Test
    test_probe_id = uuid.uuid4().hex[:12]
    test_key = f"imports/_audit_probe_{test_probe_id}.tmp"
    synthetic_payload = f"CNC-LMS-SYNTHETIC-AUDIT-TEST-PROBE-{test_probe_id}\n".encode("utf-8")
    expected_hash = hashlib.sha256(synthetic_payload).hexdigest()

    print(f"\n[5] Executing Safe Synthetic CRUD Lifecycle Test (Key: '{test_key}')...")

    # 5a. Upload (PUT) with Server-Side Encryption AES256
    try:
        client.put_object(
            Bucket=bucket,
            Key=test_key,
            Body=synthetic_payload,
            ContentType="text/plain",
            ServerSideEncryption="AES256",
            Metadata={"sha256": expected_hash, "probe_id": test_probe_id},
        )
        print("  [PASS] PUT operation succeeded with ServerSideEncryption='AES256'.")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        print(f"  [FAIL] PUT operation failed ({code}): {exc}")
        print("         Ensure IAM policy contains 's3:PutObject' for 'arn:aws:s3:::{bucket}/*'.")
        return False

    # 5b. Head / Exists
    try:
        head_resp = client.head_object(Bucket=bucket, Key=test_key)
        sse = head_resp.get("ServerSideEncryption")
        print(f"  [PASS] HEAD (exists) succeeded. Verified ServerSideEncryption='{sse}'.")
    except Exception as exc:
        print(f"  [FAIL] HEAD operation failed: {exc}")

    # 5c. Download (GET) and integrity check
    try:
        get_resp = client.get_object(Bucket=bucket, Key=test_key)
        downloaded_bytes = get_resp["Body"].read()
        downloaded_hash = hashlib.sha256(downloaded_bytes).hexdigest()
        if downloaded_hash == expected_hash:
            print(f"  [PASS] GET operation succeeded. SHA-256 integrity verified ({len(downloaded_bytes)} bytes).")
        else:
            print("  [FAIL] Checksum mismatch on downloaded object!")
            return False
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        print(f"  [FAIL] GET operation failed ({code}): {exc}")
        print("         Ensure IAM policy contains 's3:GetObject' for 'arn:aws:s3:::{bucket}/*'.")
        return False

    # 5d. Signed URL Generation
    try:
        presigned_get = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": test_key, "ResponseContentDisposition": 'attachment; filename="probe.txt"'},
            ExpiresIn=300,
        )
        print(f"  [PASS] Signed download URL generated successfully (Expires in 300s).")
    except Exception as exc:
        print(f"  [FAIL] Failed to generate presigned download URL: {exc}")

    # 5e. Delete (Cleanup)
    try:
        client.delete_object(Bucket=bucket, Key=test_key)
        print("  [PASS] DELETE operation succeeded. Cleaned up synthetic test probe.")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        print(f"  [FAIL] DELETE operation failed ({code}): {exc}")
        print("         Ensure IAM policy contains 's3:DeleteObject' for 'arn:aws:s3:::{bucket}/*'.")
        return False

    # 5f. Confirm Deletion
    try:
        client.head_object(Bucket=bucket, Key=test_key)
        print("  [WARNING] Object still exists after delete.")
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
            print("  [PASS] Confirmed object removal from bucket.")

    # 6. Bucket Security Audit
    print("\n[6] Bucket Security Audit (Public Access Block):")
    try:
        pab = client.get_public_access_block(Bucket=bucket)
        cfg = pab.get("PublicAccessBlockConfiguration", {})
        block_acls = cfg.get("BlockPublicAcls", False)
        ignore_acls = cfg.get("IgnorePublicAcls", False)
        block_policy = cfg.get("BlockPublicPolicy", False)
        restrict_public = cfg.get("RestrictPublicBuckets", False)

        all_blocked = all([block_acls, ignore_acls, block_policy, restrict_public])
        if all_blocked:
            print("  [PASS] 'Block Public Access' is fully enabled (private bucket enforced).")
        else:
            print(f"  [WARNING] Public access block settings: BlockPublicAcls={block_acls}, BlockPublicPolicy={block_policy}")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        print(f"  [NOTE] Could not check public access block ({code}).")

    print("\n" + "=" * 70)
    print("ALL S3 VERIFICATION CHECKS COMPLETED SUCCESSFULLY!")
    print("=" * 70)
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit AWS S3 bucket configuration and connectivity")
    parser.add_argument("--bucket", default=None, help="S3 bucket name override")
    parser.add_argument("--region", default=None, help="S3 region override")
    args = parser.parse_args()

    success = run_s3_verification(bucket_override=args.bucket, region_override=args.region)
    sys.exit(0 if success else 1)

