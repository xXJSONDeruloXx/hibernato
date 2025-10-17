import os
import subprocess
import re
from pathlib import Path

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio

class Plugin:
    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        self.loop = asyncio.get_event_loop()
        
        # Log effective user for debugging
        import pwd
        effective_user = pwd.getpwuid(os.getuid()).pw_name
        decky.logger.info(f"Plugin running as user: {effective_user} (UID: {os.getuid()})")
        
        # Get the helper script path
        plugin_dir = Path(decky.DECKY_PLUGIN_DIR)
        self.helper_script = plugin_dir / "bin" / "hibernate-helper.sh"
        
        # Make sure helper script is executable
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
            # No sudo needed - plugin already runs as root
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

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        decky.logger.info("hibernado plugin unloading...")
        pass

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
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

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        decky.logger.info("Migrating hibernado settings...")
        pass

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
                    "ready": False
                }
            
            status = stdout.strip()
            decky.logger.info(f"Hibernate status: {status}")
            
            if status == "READY":
                return {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": True,
                    "ready": True
                }
            elif status == "SWAP_INACTIVE":
                return {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": False,
                    "resume_configured": False,
                    "ready": False
                }
            elif status == "RESUME_NOT_CONFIGURED":
                return {
                    "success": True,
                    "swapfile_exists": True,
                    "swap_active": True,
                    "resume_configured": False,
                    "ready": False
                }
            else:  # SWAPFILE_MISSING
                return {
                    "success": True,
                    "swapfile_exists": False,
                    "swap_active": False,
                    "resume_configured": False,
                    "ready": False
                }
                
        except Exception as e:
            decky.logger.error(f"Error in check_hibernate_status: {e}")
            return {
                "success": False,
                "error": str(e),
                "ready": False
            }

    async def prepare_hibernate(self) -> dict:
        """Prepare the system for hibernation by setting up swap and resume parameters"""
        try:
            decky.logger.info("Starting hibernate preparation...")
            
            returncode, stdout, stderr = self._run_helper("prepare", timeout=60)
            
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
            decky.logger.info("Triggering hibernation...")
            
            # Write directly to /sys/power/state from Python
            # This avoids any subprocess permission issues
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
            
            # Check current status
            status = await self.check_hibernate_status()
            
            # If not ready, prepare first
            if not status.get("ready", False):
                decky.logger.info("System not ready for hibernation, preparing...")
                
                prep_result = await self.prepare_hibernate()
                if not prep_result.get("success", False):
                    return prep_result
            else:
                decky.logger.info("System already configured for hibernation")
            
            # Trigger hibernation
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
            
            # Check current status
            status = await self.check_hibernate_status()
            
            # If not ready, prepare first
            if not status.get("ready", False):
                decky.logger.info("System not ready for hibernation, preparing...")
                
                prep_result = await self.prepare_hibernate()
                if not prep_result.get("success", False):
                    return prep_result
            else:
                decky.logger.info("System already configured for hibernation")
            
            # Trigger suspend-then-hibernate using systemctl
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
            # Timeout or connection loss is expected as system suspends
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
