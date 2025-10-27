import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  Field,
  ToggleField,
  Dropdown,
  SingleDropdownOption
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
const cleanupHibernate = callable<[], any>("cleanup_hibernate");
const setPowerButtonOverride = callable<[boolean, string], any>("set_power_button_override");
const getHibernateDelay = callable<[], any>("get_hibernate_delay");
const setHibernateDelay = callable<[number], any>("set_hibernate_delay");

function Content() {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [powerButtonOverride, setPowerButtonOverrideState] = useState(false);
  const [overrideMode, setOverrideMode] = useState<"hibernate" | "suspend-then-hibernate">("hibernate");
  const [hibernateDelayMinutes, setHibernateDelayMinutes] = useState<number>(60);

  useEffect(() => {
    loadStatus();

    const interval = setInterval(() => {
      loadStatus();
      if (isLoading) {
        setIsLoading(false);
      }
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [isLoading]);

  const loadStatus = async () => {
    try {
      const result = await checkHibernateStatus();
      setStatus(result);
      
      // Update power button override state from status
      if (result.power_button_override !== undefined) {
        setPowerButtonOverrideState(result.power_button_override);
      }
      if (result.override_mode) {
        setOverrideMode(result.override_mode);
      }
      
      // Load hibernate delay setting
      if (result.ready) {
        const delayResult = await getHibernateDelay();
        if (delayResult.success && delayResult.delay_minutes) {
          setHibernateDelayMinutes(delayResult.delay_minutes);
        }
      }
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
      body: `System will suspend now, then hibernate after ${formatDelayLabel(hibernateDelayMinutes)} of inactivity`
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
    } catch (error) {
      console.error("Suspend-then-hibernate failed:", error);
      toaster.toast({
        title: "Suspend-then-Hibernate Error",
        body: String(error)
      });
      setIsLoading(false);
    }
  };

  const handleCleanup = async () => {
    setIsLoading(true);
    toaster.toast({
      title: "Removing Hibernation",
      body: "Cleaning up all hibernation configuration..."
    });
    
    try {
      const result = await cleanupHibernate();
      
      if (result.success) {
        toaster.toast({
          title: "Cleanup Complete",
          body: "All hibernation configuration removed. A reboot is recommended."
        });
        await loadStatus();
      } else {
        toaster.toast({
          title: "Cleanup Failed",
          body: result.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      console.error("Cleanup failed:", error);
      toaster.toast({
        title: "Cleanup Error",
        body: String(error)
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePowerButtonOverrideToggle = async (enabled: boolean) => {
    setIsLoading(true);
    
    try {
      const result = await setPowerButtonOverride(enabled, overrideMode);
      
      if (result.success) {
        setPowerButtonOverrideState(enabled);
        toaster.toast({
          title: enabled ? "Power Button Override Enabled" : "Power Button Override Disabled",
          body: enabled 
            ? `Power button will now trigger ${overrideMode === "hibernate" ? "immediate hibernation" : "suspend-then-hibernate"}`
            : "Power button restored to normal sleep behavior"
        });
        await loadStatus();
      } else {
        toaster.toast({
          title: "Override Failed",
          body: result.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      console.error("Power button override failed:", error);
      toaster.toast({
        title: "Override Error",
        body: String(error)
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverrideModeChange = async (mode: "hibernate" | "suspend-then-hibernate") => {
    setOverrideMode(mode);
    
    // If override is currently enabled, apply the new mode
    if (powerButtonOverride) {
      setIsLoading(true);
      
      try {
        const result = await setPowerButtonOverride(true, mode);
        
        if (result.success) {
          toaster.toast({
            title: "Override Mode Updated",
            body: `Power button will now trigger ${mode === "hibernate" ? "immediate hibernation" : "suspend-then-hibernate"}`
          });
          await loadStatus();
        } else {
          toaster.toast({
            title: "Mode Change Failed",
            body: result.error || "Unknown error occurred"
          });
        }
      } catch (error) {
        console.error("Mode change failed:", error);
        toaster.toast({
          title: "Mode Change Error",
          body: String(error)
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDelayChange = async (delayMinutes: number) => {
    setHibernateDelayMinutes(delayMinutes);
    
    try {
      const result = await setHibernateDelay(delayMinutes);
      
      if (result.success) {
        toaster.toast({
          title: "Delay Updated",
          body: `Suspend-then-hibernate delay set to ${formatDelayLabel(delayMinutes)}`
        });
      } else {
        toaster.toast({
          title: "Delay Change Failed",
          body: result.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      console.error("Delay change failed:", error);
      toaster.toast({
        title: "Delay Change Error",
        body: String(error)
      });
    }
  };

  const formatDelayLabel = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = minutes / 60;
      return `${hours} hr${hours !== 1 ? 's' : ''}`;
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

  return (
    <PanelSection>
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
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginTop: "8px",
                marginBottom: "6px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
                paddingBottom: "3px",
                color: "white"
              }}
            >
              Manual Buttons
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
              {isLoading ? "Suspending..." : `Suspend → Hibernate (${formatDelayLabel(hibernateDelayMinutes)})`}
            </ButtonItem>
          </PanelSectionRow>

          <PanelSectionRow>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginTop: "8px",
                marginBottom: "6px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
                paddingBottom: "3px",
                color: "white"
              }}
            >
              Power Button
            </div>
          </PanelSectionRow>

          <PanelSectionRow>
            <ToggleField
              label="Override Power Button"
              description={powerButtonOverride 
                ? `Power button will ${overrideMode === "hibernate" ? "hibernate immediately" : "suspend then hibernate"}`
                : "Power button works normally (suspend only)"
              }
              checked={powerButtonOverride}
              onChange={handlePowerButtonOverrideToggle}
              disabled={isLoading}
            />
          </PanelSectionRow>

          {powerButtonOverride && (
            <PanelSectionRow>
              <Field 
                label="Power Button Behavior"
                childrenLayout="below"
                childrenContainerWidth="max"
              >
                <Dropdown
                  rgOptions={[
                    {
                      data: "hibernate" as const,
                      label: "Hibernate Now"
                    },
                    {
                      data: "suspend-then-hibernate" as const,
                      label: `Suspend → Hibernate (${formatDelayLabel(hibernateDelayMinutes)})`
                    }
                  ]}
                  selectedOption={overrideMode}
                  onChange={(option: SingleDropdownOption) => handleOverrideModeChange(option.data as "hibernate" | "suspend-then-hibernate")}
                  disabled={isLoading}
                />
              </Field>
            </PanelSectionRow>
          )}
          
          <PanelSectionRow>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginTop: "8px",
                marginBottom: "6px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
                paddingBottom: "3px",
                color: "white"
              }}
            >
              Suspend-Then-Hibernate Settings
            </div>
          </PanelSectionRow>

          <PanelSectionRow>
            <Field 
              label="Delay Before Hibernation"
              childrenLayout="below"
              childrenContainerWidth="max"
            >
              <Dropdown
                rgOptions={[
                  { data: 1, label: "1 minute" },
                  { data: 5, label: "5 minutes" },
                  { data: 10, label: "10 minutes" },
                  { data: 20, label: "20 minutes" },
                  { data: 30, label: "30 minutes" },
                  { data: 60, label: "1 hour" },
                  { data: 120, label: "2 hours" },
                  { data: 180, label: "3 hours" },
                  { data: 300, label: "5 hours" }
                ]}
                selectedOption={hibernateDelayMinutes}
                onChange={(option: SingleDropdownOption) => handleDelayChange(option.data as number)}
                disabled={isLoading}
              />
            </Field>
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
      
      {status?.ready && (
        <>
          <PanelSectionRow>
            <div style={{ fontSize: "0.75em", color: "#666", marginTop: "12px", fontStyle: "italic" }}>
              Hibernation saves RAM to disk and powers off. Resume is slower than sleep but preserves battery.
            </div>
          </PanelSectionRow>
          
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={handleCleanup}
              disabled={isLoading}
            >
              {isLoading ? "Removing..." : "Remove Hibernation"}
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}
    </PanelSection>
  );
};

export default definePlugin(() => {
  console.log("hibernado plugin initializing...")

  return {
    name: "Hibernado",
    titleView: <div className={staticClasses.Title}>Hibernado</div>,
    alwaysRender: true,
    content: <Content />,
    icon: <FaTornado />,
    onDismount() {
      console.log("Hibernado unloading...")
    },
  };
});
