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

const checkHibernateStatus = callable<[], any>("check_hibernate_status");
const prepareHibernate = callable<[], any>("prepare_hibernate");
const hibernateNow = callable<[], any>("hibernate_now");
const suspendThenHibernate = callable<[], any>("suspend_then_hibernate");

function Content() {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Reset loading state in case we're waking from suspend/hibernate
    setIsLoading(false);
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
    toaster.toast({
      title: "Setting Up Hibernation",
      body: "This may take a few minutes. Creating swapfile and configuring system..."
    });
    
    try {
      const result = await prepareHibernate();
      
      if (result.success) {
        toaster.toast({
          title: "Setup Complete",
          body: "Hibernation configured successfully! All changes applied and active."
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
    toaster.toast({
      title: "Hibernating",
      body: "System will hibernate in a moment..."
    });
    
    try {
      const result = await hibernateNow();
      
      if (!result.success) {
        toaster.toast({
          title: "Hibernation Failed",
          body: result.error || "Unknown error occurred"
        });
        setIsLoading(false);
      }
      // If successful, system will hibernate and this won't execute
    } catch (error) {
      console.error("Hibernate failed:", error);
      toaster.toast({
        title: "Hibernation Error",
        body: String(error)
      });
      setIsLoading(false);
    }
  };

  const handleSuspendThenHibernate = async () => {
    setIsLoading(true);
    toaster.toast({
      title: "Suspend-then-Hibernate",
      body: "System will suspend now, then hibernate after 60 minutes of inactivity"
    });
    
    try {
      const result = await suspendThenHibernate();
      
      if (!result.success) {
        toaster.toast({
          title: "Suspend-then-Hibernate Failed",
          body: result.error || "Unknown error occurred"
        });
        setIsLoading(false);
      }
      // If successful, system will suspend and this won't execute
    } catch (error) {
      console.error("Suspend-then-hibernate failed:", error);
      toaster.toast({
        title: "Suspend-then-Hibernate Error",
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
    if (status.message) return status.message;
    if (status.ready) return "Ready for hibernation";
    return "Not configured";
  };

  const getDetailedStatus = () => {
    if (!status || !status.success) return null;
    
    const checks = [
      { label: "Swapfile (20GB)", ok: status.swapfile_exists },
      { label: "Swap active", ok: status.swap_active },
      { label: "Resume configured", ok: status.resume_configured },
      { label: "Systemd bypass", ok: status.systemd_configured },
      { label: "Bluetooth fix", ok: status.bluetooth_fix },
      { label: "Sleep config", ok: status.sleep_conf }
    ];
    
    return checks.filter(c => c.ok !== undefined);
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

      {status?.ready && (
        <>
          <PanelSectionRow>
            <div style={{ fontSize: "0.85em", color: "#aaa", marginBottom: "8px" }}>
              <strong>Note:</strong> Power button works normally. Use these buttons for hibernation.
            </div>
          </PanelSectionRow>
          
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={handleHibernate}
              disabled={isLoading}
            >
              {isLoading ? "Hibernating..." : "Hibernate Now"}
            </ButtonItem>
          </PanelSectionRow>

          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={handleSuspendThenHibernate}
              disabled={isLoading}
            >
              {isLoading ? "Suspending..." : "Suspend → Hibernate (60min)"}
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}

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

      {getDetailedStatus() && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em", marginTop: "8px" }}>
            {getDetailedStatus()?.map((check, i) => (
              <div key={i} style={{ color: check.ok ? "#4CAF50" : "#888" }}>
                {check.ok ? "✓" : "○"} {check.label}
              </div>
            ))}
          </div>
        </PanelSectionRow>
      )}
      
      {status?.ready && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.75em", color: "#666", marginTop: "12px", fontStyle: "italic" }}>
            Hibernation saves RAM to disk and powers off. Resume is slower than sleep but preserves battery.
          </div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};

export default definePlugin(() => {
  console.log("hibernado plugin initializing...")

  return {
    name: "hibernado",
    titleView: <div className={staticClasses.Title}>hibernado</div>,
    content: <Content />,
    icon: <FaTornado />,
    onDismount() {
      console.log("hibernado unloading...")
    },
  };
});
