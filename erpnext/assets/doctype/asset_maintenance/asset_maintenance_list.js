frappe.listview_settings['Asset Maintenance'] = {
    onload: function (me) {
        me.page.add_action_item("Schedule Asset Maintenance", function () {
            const maintenances = me.get_checked_items().map(o => { return o.name});
            if (maintenances.length === 0) {
                frappe.throw(_("No Asset Maintenance is selected."))
            }
            frappe.call({
                method: "erpnext.assets.doctype.asset_maintenance.asset_maintenance.list_make_maintenance_schedule",
                freeze: true,
                args: {
                    "selected_maintenances": maintenances,
                },
                callback: function (r) {
                    if (r.message) {
                        console.log(r.message)
                    }
                }
            })
        })
    }
}