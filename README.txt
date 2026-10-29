Connect your EcoFlow STREAM batteries, solar devices and Smart Meter to Homey. See battery charge, power, solar generation and grid readings where supported, with Insights, widgets and Homey Energy for the appropriate devices.

Add one STREAM Home Battery per installation for battery Energy accounting. Add STREAM Unit monitors for individual device readings without counting the same battery twice. Optional installation capacity supports the app’s widget estimates; it does not configure the capacity displayed by Homey Energy.

The original EcoFlow Smart Meter supplies grid import/export readings and totals. Use it as the whole-property meter only when it measures the property incomer. A downstream circuit meter must not also count as the whole-property source.

STREAM 5000 (ES21) and STREAM AC 5000 (ES22) support read-only monitoring through your EcoFlow app account, separate from Developer API keys. EcoFlow service changes can affect availability. These monitors send no control commands and do not contribute another battery to Energy. Installation-level Home Battery (5000) Energy validation is in progress, with a separate pairing permission disabled by default. Expansion battery, Gateway and STREAM 3000 pairing are not available. Separate EcoFlow installations are not combined automatically.

Smart Meter Dual CT currently offers a separate, optional read-only preview. Its readings are not verified for automation or accounting; it has no Homey Energy, controls, tags or Insights. CT1 property Energy accounting remains under validation. CT2 connected to a hybrid inverter may include both solar and battery output.

Original STREAM devices offer guarded settings actions and Flows. Charging and export depend on EcoFlow modes, schedules and limits. Optional coordination tools are in Support and advanced diagnostics. They require explicit source selection and consent; Flow observation does not start automatically. Its triggers can run the actions in your existing Flows.

For help, open Support and advanced diagnostics in the app settings. Reports stay local until you choose to copy or download them. Review information before sharing: schedules and energy patterns may reveal household activity. Keep existing paired devices to preserve their Flows and history.
