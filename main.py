import os
import subprocess
import re
from pathlib import Path
import decky
import asyncio

class Plugin:
    def _reset_boot_counter(self):
        """Reset the boot counter to prevent 'failed to boot' menu after hibernation
        
        SteamOS uses steamos-bootconf to track boot attempts. After resuming from hibernation,
        the system hasn't actually failed to boot, so we reset the counter.
        """
        try:
            # SteamOS-specific: Use steamos-bootconf to mark boot as successful
            result = subprocess.run(
                ["/usr/bin/steamos-bootconf", "set-mode", "booted"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                decky.logger.info("Boot counter reset via steamos-bootconf")
                return True
            else:
                decky.logger.warning(f"Could not reset boot counter: {result.stderr}")
                return False
        except FileNotFoundError:
            # Try systemd-bless-boot as fallback for non-SteamOS systems
            try:
                result = subprocess.run(
                    ["/usr/bin/systemctl", "start", "systemd-bless-boot.service"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    decky.logger.info("Boot counter reset via systemd-bless-boot")
                    return True
            except Exception:
                pass
            
            # Not critical - boot counting may not be available on all systems
            decky.logger.debug("Boot counter reset not available on this system")
            return False
        except Exception as e:
            decky.logger.warning(f"Failed to reset boot counter: {e}")
            return False

    async def _main(self):
        self.loop = asyncio.get_event_loop()
        
        # Reset boot counter on startup (in case we just resumed from hibernation)
        self._reset_boot_counter()
        
        # Log effective user for debugging
        import pwd
        effective_user = pwd.getpwuid(os.getuid()).pw_name
        decky.logger.info(f"Plugin running as user: {effective_user} (UID: {os.getuid()})")
        
        # Get the helper script path
        plugin_dir = Path(decky.DECKY_PLUGIN_DIR)
        self.helper_script = plugin_dir / "bin" / "hibernate-helper.sh"
        
        if self.helper_script.exists():
            os.chmod(self.helper_script, 0o755)
            decky.logger.info(f"hibernado plugin loaded! Helper script: {self.helper_script}")
        else:
            decky.logger.error(f"Helper script not found at {self.helper_script}")
        
    def _run_helper(self, action: str, timeout: int = 60) -> tuple[int, str, str]:
        """Run the helper script with the given action
        
        Note: Plugin runs as root due to "_root" flag in plugin.json,
        so no sudo is needed.
        """
        try:
            result = subprocess.run(
                [str(self.helper_script), action],
                capture_output=True,
                text=True,
                timeout=timeout,
                env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"}
            )
            return result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired as e:
            return -1, "", f"Timeout after {timeout} seconds"
        except Exception as e:
            return -1, "", str(e)

    async def _unload(self):
        decky.logger.info("hibernado plugin unloading...")
        pass

    async def _uninstall(self):
        decky.logger.info("hibernado plugin uninstalling - cleaning up hibernation setup...")
        try:
            # Clean up all hibernation-related changes
            returncode, stdout, stderr = self._run_helper("cleanup", timeout=60)
            
            if returncode != 0:
                decky.logger.error(f"Cleanup failed: {stderr}")
            else:
                decky.logger.info("Hibernation setup cleaned up successfully")
                
        except Exception as e:
            decky.logger.error(f"Error during uninstall cleanup: {e}")
        
        decky.logger.info("hibernado plugin uninstalled!")

    async def _migration(self):
        decky.logger.info("Migrating hibernado settings...")
        pass

    async def cleanup_hibernate(self) -> dict:
        """Remove all hibernation configuration without uninstalling the plugin"""
        try:
            decky.logger.info("User requested cleanup of hibernation configuration...")
            
            returncode, stdout, stderr = self._run_helper("cleanup", timeout=60)
            
            if returncode != 0:
                error_msg = stderr or "Unknown error during cleanup"
                decky.logger.error(f"Cleanup failed: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg
                }
            
            decky.logger.info("Hibernation configuration cleaned up successfully")
            return {
                "success": True,
                "message": "All hibernation configuration removed. Reboot recommended."
            }
            
        except Exception as e:
            error_msg = str(e)
            decky.logger.error(f"Error during cleanup: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }

    async def check_hibernate_status(self) -> dict:
        """Check if hibernation is currently set up and ready"""
        try:
            decky.logger.info("Checking hibernate status...")
            
            returncode, stdout, stderr = self._run_helper("status", timeout=5)
            
            if returncode != 0:
                decky.logger.error(f"Status check failed: {stderr}")
                return {
                    "success": False,
                    "error": stderr,
                    "ready": False,
                    "status_code": "ERROR"
                }
            
            status = stdout.strip()
            decky.logger.info(f"Hibernate status: {status}")
            
            status_map = {
                "READY": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": True,
                    "systemd_configured": True,
                    "bluetooth_fix": True,
                    "sleep_conf": True,
                    "ready": True,
                    "status_code": "READY",
                    "message": "Hibernation fully configured and ready"
                },
                "SWAPFILE_MISSING": {
                    "success": True,
                    "swapfile_exists": False,
                    "swap_active": False,
                    "resume_configured": False,
                    "ready": False,
                    "status_code": "SWAPFILE_MISSING",
                    "message": "Swapfile not found - setup required"
                },
                "SWAPFILE_TOO_SMALL": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": False,
                    "resume_configured": False,
                    "ready": False,
                    "status_code": "SWAPFILE_TOO_SMALL",
                    "message": "Swapfile too small (need 16GB+) - setup required"
                },
                "SWAP_INACTIVE": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": False,
                    "resume_configured": False,
                    "ready": False,
                    "status_code": "SWAP_INACTIVE",
                    "message": "Swapfile exists but not activated - setup required"
                },
                "RESUME_NOT_CONFIGURED": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": False,
                    "ready": False,
                    "status_code": "RESUME_NOT_CONFIGURED",
                    "message": "Resume parameters not configured - setup required"
                },
                "SYSTEMD_NOT_CONFIGURED": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": True,
                    "systemd_configured": False,
                    "ready": False,
                    "status_code": "SYSTEMD_NOT_CONFIGURED",
                    "message": "Systemd bypass not configured - setup required"
                },
                "BLUETOOTH_FIX_MISSING": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": True,
                    "systemd_configured": True,
                    "bluetooth_fix": False,
                    "ready": False,
                    "status_code": "BLUETOOTH_FIX_MISSING",
                    "message": "Bluetooth fix service missing - setup required"
                },
                "SLEEP_CONF_NOT_CONFIGURED": {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": True,
                    "systemd_configured": True,
                    "bluetooth_fix": True,
                    "sleep_conf": False,
                    "ready": False,
                    "status_code": "SLEEP_CONF_NOT_CONFIGURED",
                    "message": "Sleep configuration missing - setup required"
                }
            }
            
            return status_map.get(status, {
                "success": True,
                "ready": False,
                "status_code": "UNKNOWN",
                "message": f"Unknown status: {status}"
            })
                
        except Exception as e:
            decky.logger.error(f"Error in check_hibernate_status: {e}")
            return {
                "success": False,
                "error": str(e),
                "ready": False,
                "status_code": "ERROR"
            }

    async def prepare_hibernate(self) -> dict:
        """Prepare the system for hibernation by setting up swap and resume parameters"""
        try:
            decky.logger.info("Starting hibernate preparation...")
            
            # Timeout for swapfile creation - fallocate is fast, but allow time for grub updates
            returncode, stdout, stderr = self._run_helper("prepare", timeout=120)
            
            # Log full output for debugging
            decky.logger.info(f"Helper script returncode: {returncode}")
            if stdout:
                decky.logger.info(f"Helper script stdout: {stdout}")
            if stderr:
                decky.logger.error(f"Helper script stderr: {stderr}")
            
            if returncode != 0:
                error_msg = stderr or "Unknown error during setup"
                decky.logger.error(f"Hibernate preparation failed: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg
                }
            
            # Parse output for UUID and offset
            output = stdout.strip()
            if "SUCCESS:" in output:
                parts = output.split("SUCCESS:")[1].split(":")
                uuid = parts[0] if len(parts) > 0 else "unknown"
                offset = parts[1] if len(parts) > 1 else "unknown"
                
                decky.logger.info(f"Hibernate setup complete - UUID: {uuid}, Offset: {offset}")
                
                return {
                    "success": True,
                    "message": "Hibernation setup completed successfully",
                    "uuid": uuid,
                    "offset": offset
                }
            else:
                decky.logger.info("Hibernate setup completed")
                return {
                    "success": True,
                    "message": "Hibernation setup completed successfully"
                }
                
        except Exception as e:
            error_msg = str(e)
            decky.logger.error(f"Error in prepare_hibernate: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }

    async def trigger_hibernate(self) -> dict:
        """Trigger system hibernation"""
        try:
            # Reset boot counter before hibernating (best-effort, may not be supported)
            self._reset_boot_counter()
            
            decky.logger.info("Triggering hibernation...")
            
            # CRITICAL: Set resume device and offset before hibernating
            # The kernel needs to know where to write the hibernation image
            try:
                # Get device for /home
                result = subprocess.run(
                    ["findmnt", "-no", "SOURCE", "-T", "/home"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.returncode != 0:
                    raise Exception("Could not find /home device")
                
                dev_path = result.stdout.strip()
                decky.logger.info(f"Found /home device: {dev_path}")
                
                # Get major:minor numbers
                stat_result = subprocess.run(
                    ["stat", "-c", "%t:%T", dev_path],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if stat_result.returncode != 0:
                    raise Exception("Could not stat device")
                
                major_hex, minor_hex = stat_result.stdout.strip().split(":")
                major = int(major_hex, 16)
                minor = int(minor_hex, 16)
                resume_dev = f"{major}:{minor}"
                
                decky.logger.info(f"Device numbers: {resume_dev}")
                
                # Get swapfile offset
                result = subprocess.run(
                    ["filefrag", "-v", "/home/swapfile"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.returncode != 0:
                    raise Exception("Could not get swapfile offset")
                
                # Parse offset from filefrag output
                for line in result.stdout.splitlines():
                    if line.strip().startswith("0:"):
                        parts = line.split()
                        if len(parts) >= 4:
                            # Remove trailing ".." or "." from offset
                            offset = parts[3].rstrip(".")
                            decky.logger.info(f"Swapfile offset: {offset}")
                            break
                else:
                    raise Exception("Could not parse swapfile offset")
                
                # Write resume parameters to /sys/power/
                decky.logger.info(f"Setting resume device to {resume_dev}, offset {offset}")
                
                with open("/sys/power/resume", "w") as f:
                    f.write(f"{resume_dev}\n")
                    f.flush()
                
                with open("/sys/power/resume_offset", "w") as f:
                    f.write(f"{offset}\n")
                    f.flush()
                
                decky.logger.info("Resume parameters set successfully")
                
            except Exception as resume_error:
                error_msg = f"Failed to set resume parameters: {resume_error}"
                decky.logger.error(error_msg)
                return {
                    "success": False,
                    "error": error_msg
                }
            
            # Set hibernation mode to 'platform' (ACPI S4) to ensure proper poweroff
            try:
                with open("/sys/power/disk", "w") as f:
                    f.write("platform\n")
                    f.flush()
                decky.logger.info("Hibernation mode set to 'platform'")
            except Exception as disk_error:
                # Non-fatal, log and continue
                decky.logger.warning(f"Could not set /sys/power/disk: {disk_error}")
            
            # Sync filesystems first
            subprocess.run(["/usr/bin/sync"], check=False)
            
            # Write 'disk' to trigger hibernation
            # Using direct file write since we're running as root
            try:
                with open("/sys/power/state", "w") as f:
                    f.write("disk\n")
                    f.flush()
            except Exception as write_error:
                error_msg = f"Failed to write to /sys/power/state: {write_error}"
                decky.logger.error(error_msg)
                return {
                    "success": False,
                    "error": error_msg
                }
            
            decky.logger.info("Hibernation triggered successfully")
            return {
                "success": True,
                "message": "System is hibernating..."
            }
            
        except Exception as e:
            # Timeout or connection loss is expected as system hibernates
            if "timeout" in str(e).lower() or "timed out" in str(e).lower():
                decky.logger.info("Hibernation command sent (timeout expected)")
                return {
                    "success": True,
                    "message": "System is hibernating..."
                }
            
            error_msg = str(e)
            decky.logger.error(f"Error in trigger_hibernate: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }

    async def hibernate_now(self) -> dict:
        """Complete hibernate workflow: prepare (if needed) and hibernate"""
        try:
            decky.logger.info("Starting complete hibernate workflow...")
            
            status = await self.check_hibernate_status()
            
            if not status.get("ready", False):
                decky.logger.info("System not ready for hibernation, preparing...")
                
                prep_result = await self.prepare_hibernate()
                if not prep_result.get("success", False):
                    return prep_result
            else:
                decky.logger.info("System already configured for hibernation")
            
            return await self.trigger_hibernate()
            
        except Exception as e:
            error_msg = str(e)
            decky.logger.error(f"Error in hibernate_now: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }

    async def suspend_then_hibernate(self) -> dict:
        """Suspend (sleep) first, then hibernate after configured delay (typically 1 hour)"""
        try:
            decky.logger.info("Starting suspend-then-hibernate workflow...")
            
            status = await self.check_hibernate_status()
            
            if not status.get("ready", False):
                decky.logger.info("System not ready for hibernation, preparing...")
                
                prep_result = await self.prepare_hibernate()
                if not prep_result.get("success", False):
                    return prep_result
            else:
                decky.logger.info("System already configured for hibernation")
            
            # Reset boot counter before suspending/hibernating (best-effort, may not be supported)
            self._reset_boot_counter()
            
            decky.logger.info("Triggering suspend-then-hibernate via systemctl...")
            
            returncode, stdout, stderr = self._run_helper("suspend-then-hibernate", timeout=10)
            
            if returncode != 0:
                error_msg = stderr or "Unknown error during suspend-then-hibernate"
                decky.logger.error(f"Suspend-then-hibernate failed: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg
                }
            
            decky.logger.info("Suspend-then-hibernate triggered successfully")
            return {
                "success": True,
                "message": "System is suspending, then will hibernate..."
            }
            
        except Exception as e:
            if "timeout" in str(e).lower() or "timed out" in str(e).lower():
                decky.logger.info("Suspend-then-hibernate command sent (timeout expected)")
                return {
                    "success": True,
                    "message": "System is suspending, then will hibernate..."
                }
            
            error_msg = str(e)
            decky.logger.error(f"Error in suspend_then_hibernate: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }
