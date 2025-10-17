import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  ToggleField,
  Field
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster,
} from "@decky/api"
import { useState, useEffect } from "react";
import { VscDebugStart } from "react-icons/vsc";

// Backend callable functions
const checkHibernateStatus = callable<[], any>("check_hibernate_status");
const prepareHibernate = callable<[], any>("prepare_hibernate");
const triggerHibernate = callable<[], any>("trigger_hibernate");
const hibernateNow = callable<[], any>("hibernate_now");

function Content() {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoSetup, setAutoSetup] = useState(true);

  // Load hibernate status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const result = await checkHibernateStatus();
      setStatus(result);
    } catch (error) {
      console.error("Failed to check hibernate status:", error);
      toaster.toast({
        title: "Status Check Failed",
        body: String(error)
      });
    }
  };

  const handlePrepare = async () => {
    setIsLoading(true);
    try {
      toaster.toast({
        title: "Preparing Hibernation",
        body: "Setting up swapfile and kernel parameters..."
      });

      const result = await prepareHibernate();
      
      if (result.success) {
        toaster.toast({
          title: "Setup Complete",
          body: result.message || "Hibernation is now ready!"
        });
        await loadStatus();
      } else {
        toaster.toast({
          title: "Setup Failed",
          body: result.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      console.error("Prepare failed:", error);
      toaster.toast({
        title: "Setup Error",
        body: String(error)
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleHibernate = async () => {
    setIsLoading(true);
    try {
      if (autoSetup) {
        // Use the complete workflow
        toaster.toast({
          title: "Hibernating",
          body: "Preparing system for hibernation..."
        });

        const result = await hibernateNow();
        
        if (!result.success) {
          toaster.toast({
            title: "Hibernation Failed",
            body: result.error || "Unknown error occurred"
          });
        }
        // If successful, system will hibernate and we won't reach here
      } else {
        // Just trigger hibernation without auto-setup
        if (!status?.ready) {
          toaster.toast({
            title: "Not Ready",
            body: "Please run setup first or enable auto-setup"
          });
          setIsLoading(false);
          return;
        }

        const result = await triggerHibernate();
        
        if (!result.success) {
          toaster.toast({
            title: "Hibernation Failed",
            body: result.error || "Unknown error occurred"
          });
        }
      }
    } catch (error) {
      console.error("Hibernate failed:", error);
      toaster.toast({
        title: "Hibernation Error",
        body: String(error)
      });
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!status) return "#888";
    if (status.ready) return "#4CAF50";
    if (status.swapfile_exists || status.swap_active) return "#FF9800";
    return "#F44336";
  };

  const getStatusText = () => {
    if (!status) return "Checking...";
    if (status.ready) return "Ready";
    if (status.swapfile_exists && status.swap_active) return "Needs kernel config";
    if (status.swapfile_exists) return "Needs swap activation";
    return "Not configured";
  };

  return (
    <PanelSection title="Hibernation Control">
      <PanelSectionRow>
        <Field
          label="Status"
          description={getStatusText()}
        >
          <div style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: getStatusColor(),
            marginRight: "8px"
          }} />
        </Field>
      </PanelSectionRow>

      <PanelSectionRow>
        <ToggleField
          label="Auto-setup"
          description="Automatically configure hibernation before hibernating"
          checked={autoSetup}
          onChange={(value) => setAutoSetup(value)}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleHibernate}
          disabled={isLoading}
        >
          {isLoading ? "Processing..." : "Hibernate Now"}
        </ButtonItem>
      </PanelSectionRow>

      {!status?.ready && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handlePrepare}
            disabled={isLoading}
          >
            {isLoading ? "Setting up..." : "Setup Hibernation"}
          </ButtonItem>
        </PanelSectionRow>
      )}

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={loadStatus}
          disabled={isLoading}
        >
          Refresh Status
        </ButtonItem>
      </PanelSectionRow>

      {status && !status.success && (
        <PanelSectionRow>
          <div style={{ color: "#F44336", fontSize: "0.9em" }}>
            Error: {status.error}
          </div>
        </PanelSectionRow>
      )}

      {status?.ready && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em", color: "#4CAF50", marginTop: "8px" }}>
            ✓ Swapfile configured<br />
            ✓ Swap active<br />
            ✓ Resume parameters set
          </div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};

export default definePlugin(() => {
  console.log("Hibernato plugin initializing...")

  // Add an event listener for hibernate progress updates
  const progressListener = addEventListener<[message: string]>(
    "hibernate_progress",
    (message) => {
      console.log("Hibernate progress:", message);
      toaster.toast({
        title: "Hibernato",
        body: message
      });
    }
  );

  return {
    // The name shown in various decky menus
    name: "Hibernato",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>Hibernato</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <VscDebugStart />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Hibernato unloading...")
      removeEventListener("hibernate_progress", progressListener);
    },
  };
});
