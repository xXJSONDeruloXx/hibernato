import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  Field
} from "@decky/ui";
import {
  callable,
  definePlugin,
  toaster,
} from "@decky/api"
import { useState, useEffect } from "react";
import { FaTornado } from "react-icons/fa6";

// Backend callable functions
const checkHibernateStatus = callable<[], any>("check_hibernate_status");
const prepareHibernate = callable<[], any>("prepare_hibernate");
const hibernateNow = callable<[], any>("hibernate_now");

function Content() {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load hibernate status on mount and poll every 2 seconds
  useEffect(() => {
    loadStatus();
    
    const interval = setInterval(() => {
      loadStatus();
    }, 2000);
    
    return () => clearInterval(interval);
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
      const result = await prepareHibernate();
      
      if (result.success) {
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
      // Use the complete workflow - automatically handles setup if needed
      const result = await hibernateNow();
      
      if (!result.success) {
        toaster.toast({
          title: "Hibernation Failed",
          body: result.error || "Unknown error occurred"
        });
      }
      // If successful, system will hibernate and we won't reach here
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
  console.log("hibernado plugin initializing...")

  return {
    // The name shown in various decky menus
    name: "hibernado",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>hibernado</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <FaTornado />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("hibernado unloading...")
    },
  };
});
